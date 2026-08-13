/**
 * Decodes a raw UPx-AP frame into an 8-bit grayscale image.
 *
 * Layout: 12-byte header, then 1400×1000 quincunx samples — a value byte exists
 * at cells where (x + y) is odd, other cells are 0. The pipeline:
 *   1. place the samples at their quincunx positions,
 *   2. fill empty (x + y) even cells with the mean of the orthogonal neighbours,
 *   3. invert (raw readout is bright-on-dark; the vendor demo displays
 *      dark-ridges-on-light),
 *   4. rotate 180° (the sensor reads the array bottom-up).
 *
 * An adaptive gamma pass normalises the median to a target brightness so flat
 * or bright captures still show good ridge contrast.
 */
import { DEFAULT_DECODE_OPTIONS, UPXAP_FRAME_BYTES, UPXAP_HEADER_BYTES, UPXAP_HEIGHT, UPXAP_WIDTH, } from "./constants.js";
/**
 * Decodes a raw frame into a {@link DecodedFingerprint}. Pure function — no
 * WebUSB or device access required.
 */
export const decodeRawImage = (raw, options = {}) => {
    const headerBytes = options.headerBytes ?? UPXAP_HEADER_BYTES;
    const width = options.width ?? UPXAP_WIDTH;
    const height = options.height ?? UPXAP_HEIGHT;
    const fill = options.fill ?? "orthogonal-mean";
    const invert = options.invert ?? true;
    const rotate = options.rotate ?? 180;
    const body = raw.length > headerBytes ? raw.subarray(headerBytes) : raw;
    const pixels = new Uint8Array(width * height);
    // 1. Place the quincunx samples at their (x + y) odd positions.
    for (let y = 0; y < height; y++) {
        for (let x = (y & 1) === 0 ? 1 : 0; x < width; x += 2) {
            const src = y * width + x;
            if (src < body.length) {
                pixels[src] = body[src];
            }
        }
    }
    // 2. Fill the empty (x + y) even cells with the mean of orthogonal neighbours.
    if (fill === "orthogonal-mean") {
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
    const gammaCfg = options.gamma === undefined ? DEFAULT_DECODE_OPTIONS.gamma : options.gamma;
    if (gammaCfg) {
        const target = gammaCfg.target ?? 200;
        const min = gammaCfg.min ?? 0.5;
        const max = gammaCfg.max ?? 2.2;
        const hist = new Uint32Array(256);
        for (let i = 0; i < pixels.length; i++)
            hist[pixels[i]]++;
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
        const gamma = Math.max(min, Math.min(max, Math.log(target / 255) / Math.log(Math.max(median, 1) / 255)));
        if (Math.abs(gamma - 1) > 0.02) {
            for (let i = 0; i < pixels.length; i++) {
                pixels[i] = Math.min(255, Math.round(255 * Math.pow(pixels[i] / 255, gamma)));
            }
        }
    }
    // 4. Rotate (sensor reads the array bottom-up).
    if (rotate === 180) {
        pixels.reverse();
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
export const defaultFrameBytes = () => UPXAP_FRAME_BYTES;
//# sourceMappingURL=decode.js.map