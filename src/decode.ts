/**
 * Decodes a raw SecuGen UPx frame into an 8-bit grayscale image.
 *
 * Two layouts are supported, auto-selected by the connected product:
 *  - UPx-AP ("quincunx"): 12-byte header, then 1400×1000 quincunx samples — a
 *    value byte exists at cells where (x + y) is odd, other cells are 0.
 *  - HUPx ("plain"): NO header, 552×356 plain 8-bit row-major pixels, plus 96
 *    trailing padding bytes that are dropped.
 *
 * The pipeline for both: sample placement, optional inversion (raw readout is
 * bright-on-dark; the vendor demo displays dark-ridges-on-light), an adaptive
 * gamma pass (normalises median brightness), an adaptive contrast stretch
 * (normalises ridge/background separation — gamma alone leaves captures
 * muddy since the background-heavy histogram barely moves the median), the
 * product's orientation fix (UPx-AP: a vertical flip — the sensor streams its
 * rows bottom-up), then an optional dead-border crop.
 *
 * The UPx-AP grid is not square (~1800 × ~1160 dpi); use {@link toIsoImage}
 * to get the 500 dpi image fingerprint extractors expect.
 */
import {
  DEFAULT_DECODE_OPTIONS,
  UPXAP_FRAME_BYTES,
  UPXAP_HEADER_BYTES,
  UPXAP_HEIGHT,
  UPXAP_WIDTH,
} from "./constants.js";
import type { DecodedFingerprint, DecodeOptions } from "./types.js";

/**
 * Decodes a raw frame into a {@link DecodedFingerprint}. Pure function — no
 * WebUSB or device access required.
 */
export const decodeRawImage = (
  raw: Uint8Array,
  options: DecodeOptions = {},
): DecodedFingerprint => {
  const headerBytes = options.headerBytes ?? UPXAP_HEADER_BYTES;
  const sampling = options.sampling ?? DEFAULT_DECODE_OPTIONS.sampling;
  const width = options.width ?? UPXAP_WIDTH;
  const height = options.height ?? UPXAP_HEIGHT;
  const fill = options.fill ?? "orthogonal-mean";
  const invert = options.invert ?? true;
  const orientation =
    options.orientation ??
    (options.rotate === 180
      ? "rotate-180"
      : options.rotate === 0
      ? "none"
      : DEFAULT_DECODE_OPTIONS.orientation);

  const body = raw.length > headerBytes ? raw.subarray(headerBytes) : raw;
  const pixels = new Uint8Array(width * height);

  // 1. Place the samples. Quincunx (UPx-AP) lands bytes on (x + y) odd cells;
  //    plain (HUPx) copies the row-major buffer straight across (the frame's
  //    trailing padding beyond width×height is naturally ignored).
  if (sampling === "plain") {
    const copy = Math.min(body.length, pixels.length);
    pixels.set(body.subarray(0, copy));
  } else {
    for (let y = 0; y < height; y++) {
      for (let x = (y & 1) === 0 ? 1 : 0; x < width; x += 2) {
        const src = y * width + x;
        if (src < body.length) {
          pixels[src] = body[src];
        }
      }
    }
  }

  // 2. Fill the empty (x + y) even cells with the mean of orthogonal neighbours.
  //    Only applies to quincunx sampling — plain frames are already complete.
  if (fill === "orthogonal-mean" && sampling !== "plain") {
    for (let y = 0; y < height; y++) {
      for (let x = (y & 1) === 0 ? 0 : 1; x < width; x += 2) {
        let acc = 0;
        let n = 0;
        if (x > 0) {
          acc += pixels[y * width + x - 1];
          n++;
        }
        if (x < width - 1) {
          acc += pixels[y * width + x + 1];
          n++;
        }
        if (y > 0) {
          acc += pixels[(y - 1) * width + x];
          n++;
        }
        if (y < height - 1) {
          acc += pixels[(y + 1) * width + x];
          n++;
        }
        if (n > 0) {
          pixels[y * width + x] = Math.round(acc / n);
        }
      }
    }
  }

  // 3. Invert for the demo-app look (dark ridges on light background).
  if (invert) {
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = 255 - pixels[i];
    }
  }

  // 3b. Adaptive gamma: normalise the median to a target brightness so bright
  //     / flat captures get the reference (vendor-demo) contrast look, while
  //     already-good captures are left untouched (gamma ≈ 1). Finger
  //     placement/pressure swings the raw brightness a lot between scans, so a
  //     fixed curve would either over-darken good frames or fail to deepen
  //     flat ones. Pass `gamma: null` to disable.
  const gammaCfg =
    options.gamma === undefined ? DEFAULT_DECODE_OPTIONS.gamma : options.gamma;
  if (gammaCfg) {
    const target = gammaCfg.target ?? 200;
    const min = gammaCfg.min ?? 0.5;
    const max = gammaCfg.max ?? 2.2;
    const hist = new Uint32Array(256);
    for (let i = 0; i < pixels.length; i++) hist[pixels[i]]++;
    const half = pixels.length >> 1;
    let acc = 0;
    let median = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= half) {
        median = v;
        break;
      }
    }
    const gamma = Math.max(
      min,
      Math.min(
        max,
        Math.log(target / 255) / Math.log(Math.max(median, 1) / 255),
      ),
    );
    if (Math.abs(gamma - 1) > 0.02) {
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = Math.min(
          255,
          Math.round(255 * Math.pow(pixels[i] / 255, gamma)),
        );
      }
    }
  }

  // 3c. Adaptive contrast stretch: gamma (3b) only normalises median
  //     *brightness*, so on a fingerprint frame — background-dominated
  //     histogram — it barely touches ridge contrast, leaving captures
  //     muddy-gray instead of true black-on-white. This finds the
  //     low/high percentile intensities and linearly stretches them to
  //     0/255 (clipped). Runs for both sampling modes since the softness
  //     is a shared-pipeline issue, not specific to quincunx fill.
  const contrastCfg =
    options.contrast === undefined
      ? DEFAULT_DECODE_OPTIONS.contrast
      : options.contrast;
  if (contrastCfg) {
    const lowPercentile = contrastCfg.lowPercentile ?? 1;
    const highPercentile = contrastCfg.highPercentile ?? 99;
    const hist = new Uint32Array(256);
    for (let i = 0; i < pixels.length; i++) hist[pixels[i]]++;
    const lowCount = Math.floor((lowPercentile / 100) * pixels.length);
    const highCount = Math.floor((highPercentile / 100) * pixels.length);
    let acc = 0;
    let lowVal = 0;
    let highVal = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= lowCount) {
        lowVal = v;
        break;
      }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= highCount) {
        highVal = v;
        break;
      }
    }
    const range = highVal - lowVal;
    if (range > 0) {
      for (let i = 0; i < pixels.length; i++) {
        const stretched = ((pixels[i] - lowVal) * 255) / range;
        pixels[i] =
          stretched <= 0 ? 0 : stretched >= 255 ? 255 : Math.round(stretched);
      }
    }
  }

  // 4. Orient. "flip-vertical" reverses the row order only; "rotate-180"
  //    also reverses each row, which mirrors the print.
  if (orientation === "rotate-180") {
    pixels.reverse();
  } else if (orientation === "flip-vertical") {
    const row = new Uint8Array(width);
    for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
      row.set(pixels.subarray(top * width, (top + 1) * width));
      pixels.copyWithin(top * width, bottom * width, (bottom + 1) * width);
      pixels.set(row, bottom * width);
    }
  }

  // 5. Crop fixed dead-border pixels (sensor bezel edges / readout seam).
  // Applied last, on the final oriented image, so margins line up with what
  // you actually see on screen. No-op (default) unless `crop` is supplied.
  const crop = options.crop;
  if (crop && (crop.left || crop.right || crop.top || crop.bottom)) {
    const left = crop.left ?? 0;
    const right = crop.right ?? 0;
    const top = crop.top ?? 0;
    const bottom = crop.bottom ?? 0;
    const croppedWidth = width - left - right;
    const croppedHeight = height - top - bottom;
    if (croppedWidth <= 0 || croppedHeight <= 0) {
      throw new Error(
        `Crop margins (${left}+${right} x ${top}+${bottom}) exceed image size (${width}x${height})`,
      );
    }
    const cropped = new Uint8Array(croppedWidth * croppedHeight);
    for (let y = 0; y < croppedHeight; y++) {
      const srcStart = (y + top) * width + left;
      cropped.set(
        pixels.subarray(srcStart, srcStart + croppedWidth),
        y * croppedWidth,
      );
    }
    return {
      raw: cropped,
      byteLength: cropped.byteLength,
      width: croppedWidth,
      height: croppedHeight,
      channels: 1,
    };
  }

  return {
    raw: pixels,
    byteLength: pixels.byteLength,
    width,
    height,
    channels: 1,
  };
};

/** Convenience: total bytes expected for the default frame geometry. */
export const defaultFrameBytes = (): number => UPXAP_FRAME_BYTES;

export type { DecodedFingerprint, DecodeOptions };
