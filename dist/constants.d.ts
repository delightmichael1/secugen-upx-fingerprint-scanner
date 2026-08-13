/**
 * Device, protocol and tuning constants for the SecuGen UPx scanner family
 * (HUPx Hamster Pro / UPx-AP), reverse engineered from live USB captures and
 * validated on hardware against the vendor demo app (LED lit, full-contrast
 * image).
 *
 * Two products share the same vendor-class protocol but expose different
 * sensor geometry, so the package auto-detects the connected product by its
 * USB product id (`USBDevice.productId`) and selects the matching profile.
 */
import type { SecuGenProduct } from "./types.js";
export declare const SECUGEN_VENDOR_ID = 4450;
export declare const SECUGEN_UPXAP_PRODUCT_ID = 8976;
export declare const SECUGEN_HUPX_PRODUCT_ID = 8705;
/** @deprecated Use {@link SECUGEN_UPXAP_PRODUCT_ID}. */
export declare const SECUGEN_PRODUCT_ID = 8976;
/** Bulk IN endpoint used for image data (0x82). */
export declare const BULK_ENDPOINT = 2;
/** Frame layout: 12-byte header + 1400×1000 quincunx samples. */
export declare const UPXAP_HEADER_BYTES = 12;
export declare const UPXAP_WIDTH = 1400;
export declare const UPXAP_HEIGHT = 1000;
export declare const UPXAP_FRAME_BYTES: number;
/** Frame layout: 12-byte header + 260×300 quincunx samples. */
export declare const HUPX_HEADER_BYTES = 12;
export declare const HUPX_WIDTH = 260;
export declare const HUPX_HEIGHT = 300;
export declare const HUPX_FRAME_BYTES: number;
/**
 * Registry of supported SecuGen UPx-family products. Auto-selected by
 * `USBDevice.productId`; the default (UPx-AP, matching the original driver)
 * is kept as the fallback for backward compatibility.
 */
export declare const SCANNER_PRODUCTS: readonly SecuGenProduct[];
/** Looks up the product profile for a USB product id (defaults to UPx-AP). */
export declare const getScannerProduct: (productId?: number) => SecuGenProduct;
/**
 * Fixed 516-byte sensor init block captured from the vendor demo app (arms the
 * sensor). Sent once per capture on the init window.
 */
export declare const DEFAULT_INIT_BLOCK_HEX: string;
/** 11-byte command payloads (opcode in byte[2], params in byte[3..10]). */
export declare const DEFAULT_SETUP_COMMAND: readonly [129, 11, 120, 4, 0, 0, 0, 0, 16, 1, 0];
export declare const DEFAULT_CAPTURE_COMMAND: readonly [129, 11, 120, 3, 0, 0, 0, 0, 0, 0, 0];
export declare const DEFAULT_LED_BRIGHTNESS_COMMAND: readonly [1, 11, 143, 64, 0, 6, 11, 0, 192, 25, 9];
export declare const DEFAULT_LED_ON_COMMAND: readonly [129, 11, 142, 1, 0, 6, 11, 0, 192, 25, 9];
export declare const DEFAULT_LED_OFF_COMMAND: readonly [129, 11, 142, 0, 0, 6, 11, 0, 96, 101, 8];
/**
 * 11-byte register-write template. Bytes 2 and 3 are overwritten with the
 * register address and value before sending on the register window.
 */
export declare const DEFAULT_REGISTER_WRITE_TEMPLATE: readonly [129, 0, 0, 0, 0, 6, 11, 0, 0, 0, 0];
/**
 * Exposure / gain register pairs written before each capture. Tuned on
 * hardware (verified: 0x0a=0x80 gain, 0x0c=0x80 exposure, 0x04=0xa7) to match
 * the vendor demo app's contrast — the `exp_80_80_a7` profile.
 */
export declare const DEFAULT_EXPOSURE_REGISTERS: ReadonlyArray<readonly [number, number]>;
/** Default transfer windows and request bytes. */
export declare const DEFAULT_SCANNER_OPTIONS: {
    readonly vendorId: 4450;
    readonly productId: 8976;
    readonly interfaceNumber: 0;
    readonly configurationValue: 1;
    readonly bulkEndpoint: 2;
    readonly requestType: "class";
    readonly recipient: "interface";
    readonly request: 1;
    readonly controlIndex: 1536;
    readonly commandWindow: 1536;
    readonly registerWindow: 1792;
    readonly initWindow: 6144;
    readonly initBlock: string;
    readonly setupCommand: readonly [129, 11, 120, 4, 0, 0, 0, 0, 16, 1, 0];
    readonly captureCommand: readonly [129, 11, 120, 3, 0, 0, 0, 0, 0, 0, 0];
    readonly ledBrightnessCommand: readonly [1, 11, 143, 64, 0, 6, 11, 0, 192, 25, 9];
    readonly ledOnCommand: readonly [129, 11, 142, 1, 0, 6, 11, 0, 192, 25, 9];
    readonly ledOffCommand: readonly [129, 11, 142, 0, 0, 6, 11, 0, 96, 101, 8];
    readonly registerWriteTemplate: readonly [129, 0, 0, 0, 0, 6, 11, 0, 0, 0, 0];
    readonly exposureRegisters: readonly (readonly [number, number])[];
    readonly warmupCapture: true;
    readonly ledHoldMs: 700;
    readonly captureTimeoutMs: 45000;
    readonly expectedFrameBytes: number;
};
/** Default decoder behaviour (see DecodeOptions). */
export declare const DEFAULT_DECODE_OPTIONS: {
    readonly headerBytes: 12;
    readonly width: 1400;
    readonly height: 1000;
    readonly fill: "orthogonal-mean";
    readonly invert: true;
    readonly rotate: 180;
    readonly gamma: {
        readonly target: 200;
        readonly min: 0.5;
        readonly max: 2.2;
    };
};
//# sourceMappingURL=constants.d.ts.map