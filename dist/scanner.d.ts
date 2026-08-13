/**
 * SecuGen UPx-family WebUSB scanner driver.
 *
 * Captures a fingerprint frame by replaying the reverse-engineered protocol:
 * init block → streaming setup → exposure/gain register writes → warmup
 * capture (drained) → LED on → real capture → LED off. All protocol constants
 * and tuning values are configurable via {@link ScannerOptions}. The connected
 * product (HUPx / UPx-AP) is auto-detected from `USBDevice.productId`.
 */
import { SCANNER_PRODUCTS, SECUGEN_HUPX_PRODUCT_ID, SECUGEN_PRODUCT_ID, SECUGEN_UPXAP_PRODUCT_ID, SECUGEN_VENDOR_ID, getScannerProduct } from "./constants.js";
import type { DecodedFingerprint, DecodeOptions, ResolvedScannerOptions, ScannerOptions, SecuGenProduct } from "./types.js";
/** Merges user {@link ScannerOptions} onto the verified defaults. */
export declare const resolveScannerOptions: (options?: ScannerOptions) => ResolvedScannerOptions;
/**
 * Resolves the scanner + decode geometry for a *connected* device: the product
 * profile (HUPx vs UPx-AP) is detected from `device.productId`, and the frame
 * size defaults to that product's geometry unless the caller overrode it.
 */
export declare const resolveScannerOptionsForDevice: (device: Pick<USBDevice, "productId">, options?: ScannerOptions) => {
    scan: ResolvedScannerOptions;
    decode: DecodeOptions;
    product: SecuGenProduct;
};
/**
 * Scanner driver bound to a WebUSB device. Create one with `new SecuGenScanner(device, options)`
 * or the {@link createScanner} / {@link openScanner} helpers. The product
 * (HUPx / UPx-AP) is auto-detected from the device; pass an explicit
 * `productId` in {@link ScannerOptions} to override.
 */
export declare class SecuGenScanner {
    private readonly device;
    private readonly opts;
    private readonly product;
    constructor(device: USBDevice, options?: ScannerOptions);
    /** The resolved options (defaults merged with any overrides). */
    get options(): ResolvedScannerOptions;
    /** The detected product profile (HUPx / UPx-AP). */
    get productInfo(): SecuGenProduct;
    private ctlSetup;
    /** Sends an 11-byte command on the given window (default: command window). */
    private sendCommand;
    /** Writes one register on the register window using the write template. */
    private writeRegister;
    /**
     * Reads one frame from the bulk IN endpoint. The device streams the frame
     * as one transfer (many URBs), which ends with a USB short packet (or
     * zero-length packet). We read until that end marker rather than demanding
     * an exact frame size — the product geometry is only a *hint* (used to
     * sanity-check + decode), so a real HUPx/UPx-AP frame of slightly different
     * size still completes instead of hanging into the timeout.
     */
    captureBulk(expectedLength?: number): Promise<Uint8Array>;
    /** Drains the warmup capture frame (may arrive truncated; discarded). */
    drainWarmup(): Promise<void>;
    /** Opens the device, selects the configuration and claims the interface. */
    open(): Promise<void>;
    /** Releases the interface and closes the device. */
    close(): Promise<void>;
    /**
     * Runs the full capture sequence and returns the raw frame
     * (header + pixels, e.g. 1,400,012 bytes).
     */
    capture(): Promise<Uint8Array>;
    /**
     * Captures and decodes in one call, returning a {@link DecodedFingerprint}.
     * Pass {@link DecodeOptions} to tune contrast / polarity / orientation.
     * Width/height/header default to the detected product's geometry.
     */
    scan(decodeOptions?: DecodeOptions): Promise<DecodedFingerprint>;
}
/** Checks if WebUSB is supported in the current browser environment. */
export declare const isWebUsbSupported: () => boolean;
/** Prompts the user to pick the SecuGen scanner from the WebUSB chooser. */
export declare const requestScannerDevice: (options?: ScannerOptions) => Promise<USBDevice>;
/** Finds a previously-granted SecuGen scanner without prompting the user. */
export declare const getGrantedScannerDevice: (options?: ScannerOptions) => Promise<USBDevice | null>;
/** Resolves the product profile for a connected device (HUPx / UPx-AP). */
export declare const detectProduct: (device: Pick<USBDevice, "productId">, options?: ScannerOptions) => SecuGenProduct;
/** Opens the device and claims the interface. */
export declare const openScanner: (device: USBDevice, options?: ScannerOptions) => Promise<void>;
/** Releases the interface and closes the device. */
export declare const closeScanner: (device: USBDevice) => Promise<void>;
/** Runs the full capture sequence and returns the raw frame. */
export declare const scanFingerprint: (device: USBDevice, options?: ScannerOptions) => Promise<Uint8Array>;
/** Reads a raw frame from the bulk IN endpoint. */
export declare const captureBulk: (device: USBDevice, expectedLength?: number, options?: ScannerOptions) => Promise<Uint8Array>;
/** Captures a frame and decodes it in one call. */
export declare const scanAndDecode: (device: USBDevice, scanOptions?: ScannerOptions, decodeOptions?: DecodeOptions) => Promise<DecodedFingerprint>;
/** Convenience factory for a configured scanner instance. */
export declare const createScanner: (device: USBDevice, options?: ScannerOptions) => SecuGenScanner;
export type { DecodedFingerprint, DecodeOptions, ResolvedScannerOptions, ScannerOptions, SecuGenProduct, };
export { SECUGEN_PRODUCT_ID, SECUGEN_VENDOR_ID, SECUGEN_HUPX_PRODUCT_ID, SECUGEN_UPXAP_PRODUCT_ID, SCANNER_PRODUCTS, getScannerProduct, };
//# sourceMappingURL=scanner.d.ts.map