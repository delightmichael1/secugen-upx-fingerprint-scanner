import { describe, expect, it } from "vitest";
import {
  decodeRawImage,
  HUPX_WIDTH,
  HUPX_HEIGHT,
  UPXAP_WIDTH,
  UPXAP_HEIGHT,
} from "../src/index.js";

/**
 * Builds a raw frame whose body holds quincunx samples the way the sensor
 * actually streams them: a value at every (x + y) odd cell, 0 elsewhere.
 */
const makeQuincunxFrame = (
  width: number,
  height: number,
  headerBytes: number,
  value: number,
): Uint8Array => {
  const bodies = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = (y & 1) === 0 ? 1 : 0; x < width; x += 2) {
      bodies[y * width + x] = value;
    }
  }
  const raw = new Uint8Array(headerBytes + bodies.length);
  raw.set(bodies, headerBytes);
  return raw;
};

describe("decodeRawImage — geometry", () => {
  it("decodes a HUPx 552×356 plain frame to the product geometry", () => {
    // Plain HUPx frame: no header, 552×356 row-major pixels + 96 trailing.
    const pixels = new Uint8Array(HUPX_WIDTH * HUPX_HEIGHT).fill(200);
    const raw = new Uint8Array(pixels.length + 96);
    raw.set(pixels);
    const image = decodeRawImage(raw, {
      sampling: "plain",
      width: HUPX_WIDTH,
      height: HUPX_HEIGHT,
      fill: "none",
      invert: false,
      rotate: 0,
      gamma: null,
    });
    expect(image.width).toBe(552);
    expect(image.height).toBe(356);
    expect(image.byteLength).toBe(552 * 356);
    expect(image.channels).toBe(1);
    // Trailing padding is dropped; row-major bytes land in order.
    expect(image.raw[0]).toBe(200);
    expect(image.raw[HUPX_WIDTH]).toBe(200);
  });

  it("decodes a UPx-AP 1400×1000 frame to the product geometry", () => {
    const raw = makeQuincunxFrame(UPXAP_WIDTH, UPXAP_HEIGHT, 12, 200);
    const image = decodeRawImage(raw, {
      width: 1400,
      height: 1000,
      fill: "none",
      invert: false,
      rotate: 0,
      gamma: null,
    });
    expect(image.byteLength).toBe(1400 * 1000);
  });
});

describe("decodeRawImage — pixel pipeline", () => {
  const decode = (
    raw: Uint8Array,
    extra: Parameters<typeof decodeRawImage>[1] = {},
  ) =>
    decodeRawImage(raw, {
      headerBytes: 12,
      width: HUPX_WIDTH,
      height: HUPX_HEIGHT,
      fill: "none",
      invert: false,
      rotate: 0,
      gamma: null,
      ...extra,
    });

  it("places samples at (x+y) odd cells and leaves even cells zero", () => {
    const raw = makeQuincunxFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 200);
    const image = decode(raw);
    // (0,0) is an even cell → stays 0 with fill:none.
    expect(image.raw[0]).toBe(0);
    // (1,0) is an odd cell → holds the sample value.
    expect(image.raw[1]).toBe(200);
    // (0,1) is an odd cell (row below) → holds the sample value.
    expect(image.raw[HUPX_WIDTH]).toBe(200);
  });

  it("fills even cells with the orthogonal-mean", () => {
    const raw = makeQuincunxFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 200);
    const image = decode(raw, { fill: "orthogonal-mean" });
    // Corner (0,0) — its two orthogonal neighbours (1,0) and (0,1) are 200.
    expect(image.raw[0]).toBe(200);
  });

  it("inverts polarity when invert is true", () => {
    const raw = makeQuincunxFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 200);
    const plain = decode(raw);
    const inverted = decode(raw, { invert: true });
    const sample = 1; // (1,0)
    expect(inverted.raw[sample]).toBe(255 - plain.raw[sample]);
  });

  it("rotates 180° by reversing the array", () => {
    const raw = makeQuincunxFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 200);
    const plain = decode(raw);
    const rotated = decode(raw, { rotate: 180 });
    // reversed vector
    expect([...rotated.raw]).toEqual([...plain.raw].reverse());
  });

  it("flip-vertical reverses row order but keeps columns (no mirror)", () => {
    const width = 4;
    const height = 3;
    // Plain frame where each pixel encodes its own position: 10*y + x.
    const raw = Uint8Array.from({ length: width * height }, (_, i) =>
      10 * Math.floor(i / width) + (i % width),
    );
    const opts = {
      sampling: "plain" as const,
      headerBytes: 0,
      width,
      height,
      invert: false,
      gamma: null,
      contrast: null,
    };
    const flipped = decodeRawImage(raw, { ...opts, orientation: "flip-vertical" });
    expect([...flipped.raw.subarray(0, width)]).toEqual([20, 21, 22, 23]);
    expect([...flipped.raw.subarray(2 * width)]).toEqual([0, 1, 2, 3]);
    const rotated = decodeRawImage(raw, { ...opts, orientation: "rotate-180" });
    expect([...rotated.raw.subarray(0, width)]).toEqual([23, 22, 21, 20]);
  });

  it("supports adaptive gamma and leaves good frames near gamma 1", () => {
    // Use orthogonal-mean so the whole frame settles ~200 → median 200 =
    // target → gamma ≈ 1 and pixels stay put.
    const raw = makeQuincunxFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 200);
    const noGamma = decode(raw, { fill: "orthogonal-mean", gamma: null });
    const withGamma = decode(raw, {
      fill: "orthogonal-mean",
      gamma: { target: 200, min: 0.5, max: 2.2 },
    });
    expect(withGamma.byteLength).toBe(noGamma.byteLength);
    for (let i = 0; i < noGamma.raw.length; i += 509) {
      expect(Math.abs(withGamma.raw[i] - noGamma.raw[i])).toBeLessThanOrEqual(1);
    }
  });

  it("tolerates a truncated frame shorter than the declared header+body", () => {
    const raw = new Uint8Array(100); // far below 640×307
    const image = decode(raw);
    expect(image.byteLength).toBe(HUPX_WIDTH * HUPX_HEIGHT);
    expect(image.raw.every((v) => v === 0)).toBe(true);
  });
});