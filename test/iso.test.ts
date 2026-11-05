import { describe, expect, it } from "vitest";
import {
  getScannerProduct,
  SECUGEN_HUPX_PRODUCT_ID,
  SECUGEN_UPXAP_PRODUCT_ID,
  toIsoImage,
} from "../src/index.js";

const image = (width: number, height: number, fill = 255) => ({
  raw: new Uint8Array(width * height).fill(fill),
  width,
  height,
});

const boundingBox = (img: { raw: Uint8Array; width: number; height: number }) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.raw[y * img.width + x] < 128) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1, minX, minY };
};

describe("toIsoImage", () => {
  it("returns SecuGen's standard 300×400 window at 500 dpi by default", () => {
    const iso = toIsoImage(image(1400, 1000), { x: 1800, y: 1160 });
    expect(iso.width).toBe(300);
    expect(iso.height).toBe(400);
    expect(iso.dpi).toBe(500);
    expect(iso.raw.byteLength).toBe(300 * 400);
  });

  it("resamples each axis by its own resolution", () => {
    // A 0.2-inch dark square on a 1800 × 1160 dpi grid is 360 × 232 px; at
    // 500 dpi it must come out square, 100 × 100 px.
    const src = image(900, 580);
    for (let y = 174; y < 174 + 232; y++) {
      src.raw.fill(0, y * 900 + 270, y * 900 + 270 + 360);
    }
    const box = boundingBox(toIsoImage(src, { x: 1800, y: 1160 }));
    expect(box.w).toBeGreaterThanOrEqual(99);
    expect(box.w).toBeLessThanOrEqual(101);
    expect(box.h).toBeGreaterThanOrEqual(99);
    expect(box.h).toBeLessThanOrEqual(101);
  });

  it("centres the window on the print and clamps it inside the image", () => {
    // Already 500 dpi (no scaling): a striped "print" around (500, 500) in a
    // 600 × 600 image pulls the window to the bottom-right corner.
    const src = image(600, 600);
    for (let y = 420; y < 580; y++) {
      for (let x = 420; x < 580; x++) {
        src.raw[y * 600 + x] = (x - 420) % 8 < 4 ? 0 : 255;
      }
    }
    const iso = toIsoImage(src, { x: 500, y: 500 });
    // Window origin clamps to (300, 200), so the stripes start at (120, 220).
    const box = boundingBox(iso);
    expect(box.minX).toBe(120);
    expect(box.minY).toBe(220);
  });

  it("pads a smaller image onto a light background, centred", () => {
    const iso = toIsoImage(image(100, 100, 0), { x: 500, y: 500 });
    const box = boundingBox(iso);
    expect(box).toMatchObject({ w: 100, h: 100, minX: 100, minY: 150 });
  });

  it("ships a calibrated resolution and vertical flip for the UPx-AP", () => {
    const upxAp = getScannerProduct(SECUGEN_UPXAP_PRODUCT_ID);
    expect(upxAp.orientation).toBe("flip-vertical");
    expect(upxAp.resolutionDpi).toEqual({ x: 1800, y: 1160 });
  });

  it("turns the HUPx raw frame into SecuGen's 260×300 standard image", () => {
    // 552×356 at 1062×593 dpi is the whole 13.2×15.2 mm active area; at 500 dpi
    // that is exactly 260×300 — SecuGen's own HUPx image. Pass that window so
    // we do not letterbox into the UPx-AP's 300×400 canvas.
    const hupx = getScannerProduct(SECUGEN_HUPX_PRODUCT_ID);
    const raw = new Uint8Array(552 * 356).fill(255);
    const iso = toIsoImage(
      { raw, width: 552, height: 356 },
      { x: 1062, y: 593 },
      hupx.isoImage,
    );
    expect(iso).toMatchObject({ width: 260, height: 300, dpi: 500 });
    expect(Math.round((552 * 500) / 1062)).toBe(260);
    expect(Math.round((356 * 500) / 593)).toBe(300);
  });

  it("ships invert for both; HUPx orientation none, UPx-AP flip-vertical", () => {
    const hupx = getScannerProduct(SECUGEN_HUPX_PRODUCT_ID);
    const upxAp = getScannerProduct(SECUGEN_UPXAP_PRODUCT_ID);
    expect(hupx.orientation).toBe("none");
    expect(hupx.flipHorizontal).toBe(false);
    expect(upxAp.orientation).toBe("flip-vertical");
    expect(hupx.invertDecoded).toBe(true);
    expect(upxAp.invertDecoded).toBe(true);
  });
});
