/**
 * Device, protocol and tuning constants for the SecuGen UPx scanner family
 * (HUPx Hamster Pro / UPx-AP), reverse engineered from live USB captures and
 * validated on hardware against the vendor demo app (LED lit, full-contrast
 * image).
 *
 * The two products expose different protocols AND sensor geometry, so the
 * package auto-detects the connected product by its USB product id
 * (`USBDevice.productId`) and selects the matching profile:
 *  - **UPx-AP** (0x2310): vendor-class command protocol on 0x0600/0x0700/0x1800
 *    windows, 1400×1000 quincunx-sampled frame with a 12-byte header.
 *  - **HUPx** (0x2201): register-based protocol (bRequest 0x22, wValue 0x0033,
 *    wIndex = register, read-back verify), 552×356 plain 8-bit row-major frame
 *    with NO header and 96 trailing padding bytes.
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
/**
 * Frame layout: NO header, 552×356 plain 8-bit row-major pixels, then 96
 * trailing near-zero padding bytes. Total bulk frame = 196,608 bytes (the demo
 * app reads it as 76,800 + 76,800 + 43,008). The 96 trailing bytes are not
 * pixels — the decoder reads only the first 552×356 bytes and drops the tail.
 *
 * Geometry was re-derived from a real (LED-on) capture: adjacent-row
 * correlation peaks at 0.883 for a 552-byte row pitch vs ~0.015 at 640 (the
 * previously-assumed 640×307 was wrong and scrambled every row by 640−552=88
 * pixels). 552×356 = 196,512 px + 96 trailing = 196,608 B total.
 */
export declare const HUPX_HEADER_BYTES = 0;
export declare const HUPX_WIDTH = 552;
export declare const HUPX_HEIGHT = 356;
export declare const HUPX_TRAILING_BYTES = 96;
export declare const HUPX_FRAME_BYTES: number;
/** bRequest for register reads/writes; wValue is always {@link HUPX_REGISTER_VALUE}. */
export declare const HUPX_REGISTER_REQUEST = 34;
/** wValue carried by every register access. wIndex = the register address. */
export declare const HUPX_REGISTER_VALUE = 51;
/** TRIG — starts a capture (OUT, wVal 0x0001). */
export declare const HUPX_TRIGGER_REQUEST = 5;
export declare const HUPX_TRIGGER_VALUE = 1;
/** Status poll (IN, wIdx 0x2000, wLen 10). */
export declare const HUPX_STATUS_REQUEST = 8;
export declare const HUPX_STATUS_INDEX = 8192;
export declare const HUPX_STATUS_LENGTH = 10;
/** cmd01 — opens the readout gate (OUT, wVal 0) BEFORE the bulk image read. */
export declare const HUPX_CMD01_REQUEST = 1;
/** cmd02 — closes the readout gate (OUT, wVal 0) AFTER the bulk image read. */
export declare const HUPX_CMD02_REQUEST = 2;
/**
 * cmd11 — LED gate (OUT, wVal {@link HUPX_LED_ON_VALUE} / {@link HUPX_LED_OFF_VALUE}).
 * Confirmed from the demo capture: wVal 0x0001 right before the real (long-exposure)
 * capture pass, wVal 0x0000 after it. Without this the platen LED never lights and
 * the resulting frame is dark.
 */
export declare const HUPX_CMD11_REQUEST = 17;
export declare const HUPX_LED_ON_VALUE = 1;
export declare const HUPX_LED_OFF_VALUE = 0;
/** Image-ready status poll used around the real capture pass (IN, wIdx 0, wLen 4). */
export declare const HUPX_STATUS_POLL_REQUEST = 22;
export declare const HUPX_STATUS_POLL_LENGTH = 4;
/**
 * HUPx register init sequence captured from the vendor demo app (first capture
 * cycle, ~150 registers). Each is written then read back to verify. This arms
 * the sensor: sensor timing/exposure LUT registers, DPI scaling tables, and
 * the final R3/R122/R123/R124 values that gate the readout.
 */
export declare const HUPX_INIT_REGISTERS: ReadonlyArray<readonly [number, number]>;
/**
 * HUPx exposure / gain registers written before each capture (overrides the
 * init values with the demo's "long exposure" profile): R240-244 = 0xf0-0xf4
 * exposure = 0x24 0x30 0x28 0x24 0x66, gain R48/R49 = 0x30/0x31 = 0x02/0x58.
 */
/**
 * HUPx "long exposure" profile, written during the real capture pass:
 * R240-244 exposure registers = 0xf0-0xf4 = 0x24 0x30 0x28 0x24 0x66.
 * The long-exposure gain (R48/R49) is written separately via
 * {@link HUPX_CAPTURE_GAIN_REGISTERS} after the pass-2 TRIG, matching the demo.
 */
export declare const HUPX_EXPOSURE_REGISTERS: ReadonlyArray<readonly [number, number]>;
/**
 * HUPx long-exposure gain registers (R48/R49 = 0x30/0x31 = 0x02/0x58), written
 * after the pass-2 TRIG (and again after the LED comes on), matching the demo.
 */
export declare const HUPX_CAPTURE_GAIN_REGISTERS: ReadonlyArray<readonly [number, number]>;
/**
 * HUPx short-exposure gain registers for the discarded calibrate/warmup pass.
 * The demo writes R48/R49 = 0x01/0x2c (short exposure) for the first frame of
 * each scan, then switches to the long-exposure profile
 * ({@link HUPX_EXPOSURE_REGISTERS}) for the real capture.
 */
export declare const HUPX_CALIBRATE_GAIN_REGISTERS: ReadonlyArray<readonly [number, number]>;
/**
 * Registry of supported SecuGen UPx-family products. Auto-selected by
 * `USBDevice.productId`; the default (UPx-AP, matching the original driver)
 * is kept as the fallback for backward compatibility.
 */
export declare const DEFAULT_EXPOSURE_REGISTERS: ReadonlyArray<readonly [number, number]>;
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
    readonly protocol: "class-command";
    readonly register: {
        readonly request: 34;
        readonly value: 51;
        readonly verify: true;
        readonly triggerRequest: 5;
        readonly triggerValue: 1;
        readonly statusRequest: 8;
        readonly statusIndex: 8192;
        readonly statusLength: 10;
        readonly cmd01Request: 1;
        readonly cmd02Request: 2;
        readonly cmd11Request: 17;
        readonly ledOnValue: 1;
        readonly ledOffValue: 0;
        readonly statusPollRequest: 22;
        readonly statusPollLength: 4;
        readonly calibrateGainRegisters: readonly (readonly [number, number])[];
        readonly captureGainRegisters: readonly (readonly [number, number])[];
        readonly initRegisters: readonly (readonly [number, number])[];
    };
};
/** Default decoder behaviour (see DecodeOptions). */
export declare const DEFAULT_DECODE_OPTIONS: {
    readonly headerBytes: 12;
    readonly sampling: "quincunx";
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
    readonly contrast: {
        readonly lowPercentile: 1;
        readonly highPercentile: 99;
    };
};
//# sourceMappingURL=constants.d.ts.map