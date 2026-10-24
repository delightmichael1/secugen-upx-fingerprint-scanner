import type { DecodedFingerprint } from "./types.js";
export interface IsoImageOptions {
    /** Output width in pixels (default 300 — SecuGen's standard image). */
    width?: number;
    /** Output height in pixels (default 400). */
    height?: number;
    /** Output resolution in dots per inch (default 500, the ISO interchange resolution). */
    dpi?: number;
}
export interface IsoImage {
    /** Grayscale pixels, row-major, `width × height` bytes. */
    raw: Uint8Array;
    width: number;
    height: number;
    dpi: number;
}
export declare const toIsoImage: (image: Pick<DecodedFingerprint, "raw" | "width" | "height">, resolutionDpi: {
    x: number;
    y: number;
}, options?: IsoImageOptions) => IsoImage;
//# sourceMappingURL=iso.d.ts.map