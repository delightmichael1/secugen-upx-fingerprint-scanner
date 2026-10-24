/**
 * Turns a decoded frame into the image SecuGen's own SDK hands its extractor
 * (what SGFPM_GetImage returns): a true 500 dpi on both axes, cropped to the
 * standard 300×400 window.
 *
 * Templates extracted from this image line up with ones enrolled by other
 * SecuGen-based systems (the Nexus switch, its dashboard), which is what makes
 * cross-system enrol/verify work: the raw UPx-AP grid is ~1800 × ~1160 dpi,
 * so extracting from it directly produces minutiae that are stretched
 * unevenly and can never be matched against a 500 dpi enrolment.
 *
 * Pass a frame that is already upright and has dark ridges on a light
 * background (`decodeRawImage` with `invert: true`).
 */
import { ISO_IMAGE_DPI, ISO_IMAGE_HEIGHT, ISO_IMAGE_WIDTH, } from "./constants.js";
/**
 * Per-output-index source coverage for an area-averaging resample of one
 * axis: each output pixel averages the source pixels it covers, weighted by
 * the covered fraction, so downscaling never aliases ridge detail.
 */
const axisWeights = (srcLen, outLen) => {
    const step = srcLen / outLen;
    const starts = new Int32Array(outLen);
    const ends = new Int32Array(outLen);
    const weights = [];
    for (let i = 0; i < outLen; i++) {
        const from = i * step;
        const to = Math.min((i + 1) * step, srcLen);
        const first = Math.floor(from);
        const last = Math.min(Math.ceil(to), srcLen);
        const w = [];
        for (let k = first; k < last; k++) {
            w.push((Math.min(k + 1, to) - Math.max(k, from)) / (to - from));
        }
        starts[i] = first;
        ends[i] = last;
        weights.push(w);
    }
    return { starts, ends, weights };
};
const resample = (src, w, h, outW, outH) => {
    // Horizontal pass into floats, then vertical pass into bytes.
    const cols = axisWeights(w, outW);
    const rows = axisWeights(h, outH);
    const tmp = new Float32Array(outW * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < outW; x++) {
            let acc = 0;
            const wx = cols.weights[x];
            for (let k = cols.starts[x]; k < cols.ends[x]; k++) {
                acc += src[y * w + k] * wx[k - cols.starts[x]];
            }
            tmp[y * outW + x] = acc;
        }
    }
    const out = new Uint8Array(outW * outH);
    for (let y = 0; y < outH; y++) {
        const wy = rows.weights[y];
        for (let x = 0; x < outW; x++) {
            let acc = 0;
            for (let k = rows.starts[y]; k < rows.ends[y]; k++) {
                acc += tmp[k * outW + x] * wy[k - rows.starts[y]];
            }
            out[y * outW + x] = Math.min(255, Math.max(0, Math.round(acc)));
        }
    }
    return out;
};
/**
 * Centre of the ridge texture: blocks are weighted by their pixel variance,
 * so the flat background (and an off-centre finger) pulls the crop window
 * onto the print rather than the middle of the sensor.
 */
const ridgeCentroid = (pix, w, h) => {
    const block = 16;
    let sx = 0;
    let sy = 0;
    let total = 0;
    for (let by = 0; by + block <= h; by += block) {
        for (let bx = 0; bx + block <= w; bx += block) {
            let sum = 0;
            let sq = 0;
            for (let y = by; y < by + block; y++) {
                for (let x = bx; x < bx + block; x++) {
                    const v = pix[y * w + x];
                    sum += v;
                    sq += v * v;
                }
            }
            const n = block * block;
            const variance = sq / n - (sum / n) ** 2;
            sx += variance * (bx + block / 2);
            sy += variance * (by + block / 2);
            total += variance;
        }
    }
    return total > 0 ? { x: sx / total, y: sy / total } : { x: w / 2, y: h / 2 };
};
export const toIsoImage = (image, resolutionDpi, options = {}) => {
    const outW = options.width ?? ISO_IMAGE_WIDTH;
    const outH = options.height ?? ISO_IMAGE_HEIGHT;
    const dpi = options.dpi ?? ISO_IMAGE_DPI;
    const w = Math.max(1, Math.round((image.width * dpi) / resolutionDpi.x));
    const h = Math.max(1, Math.round((image.height * dpi) / resolutionDpi.y));
    const scaled = resample(image.raw, image.width, image.height, w, h);
    // Crop the window around the print, clamped inside the image; a scaled
    // image smaller than the window is centred on a light background instead.
    const centre = ridgeCentroid(scaled, w, h);
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    const srcX = w > outW ? clamp(Math.round(centre.x - outW / 2), w - outW) : 0;
    const srcY = h > outH ? clamp(Math.round(centre.y - outH / 2), h - outH) : 0;
    const dstX = w < outW ? Math.floor((outW - w) / 2) : 0;
    const dstY = h < outH ? Math.floor((outH - h) / 2) : 0;
    const copyW = Math.min(w, outW);
    const copyH = Math.min(h, outH);
    const raw = new Uint8Array(outW * outH).fill(255);
    for (let y = 0; y < copyH; y++) {
        const from = (srcY + y) * w + srcX;
        raw.set(scaled.subarray(from, from + copyW), (dstY + y) * outW + dstX);
    }
    return { raw, width: outW, height: outH, dpi };
};
//# sourceMappingURL=iso.js.map