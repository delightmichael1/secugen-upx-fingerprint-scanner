import type { DecodedFingerprint, DecodeOptions } from "./types.js";
/**
 * Decodes a raw frame into a {@link DecodedFingerprint}. Pure function — no
 * WebUSB or device access required.
 */
export declare const decodeRawImage: (raw: Uint8Array, options?: DecodeOptions) => DecodedFingerprint;
/** Convenience: total bytes expected for the default frame geometry. */
export declare const defaultFrameBytes: () => number;
export type { DecodedFingerprint, DecodeOptions };
//# sourceMappingURL=decode.d.ts.map