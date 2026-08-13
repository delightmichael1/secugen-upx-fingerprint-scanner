/**
 * secugen-upx-fingerprint-scanner
 *
 * Framework-agnostic WebUSB driver + decoder for the SecuGen UPx family
 * fingerprint scanners — HUPx (Hamster Pro, 0x2201) and UPx-AP (0x2310).
 * Capture sequence, register tuning and frame decode were reverse-engineered
 * from the vendor demo app and validated on hardware. The connected product
 * is auto-detected from its USB product id.
 */
export { SecuGenScanner, isWebUsbSupported, requestScannerDevice, getGrantedScannerDevice, openScanner, closeScanner, scanFingerprint, captureBulk, scanAndDecode, createScanner, resolveScannerOptions, resolveScannerOptionsForDevice, detectProduct, } from "./scanner.js";
export { decodeRawImage } from "./decode.js";
export { SECUGEN_VENDOR_ID, SECUGEN_PRODUCT_ID, SECUGEN_UPXAP_PRODUCT_ID, SECUGEN_HUPX_PRODUCT_ID, BULK_ENDPOINT, UPXAP_HEADER_BYTES, UPXAP_WIDTH, UPXAP_HEIGHT, UPXAP_FRAME_BYTES, HUPX_HEADER_BYTES, HUPX_WIDTH, HUPX_HEIGHT, HUPX_FRAME_BYTES, SCANNER_PRODUCTS, getScannerProduct, DEFAULT_INIT_BLOCK_HEX, DEFAULT_SETUP_COMMAND, DEFAULT_CAPTURE_COMMAND, DEFAULT_LED_BRIGHTNESS_COMMAND, DEFAULT_LED_ON_COMMAND, DEFAULT_LED_OFF_COMMAND, DEFAULT_REGISTER_WRITE_TEMPLATE, DEFAULT_EXPOSURE_REGISTERS, DEFAULT_SCANNER_OPTIONS, DEFAULT_DECODE_OPTIONS, } from "./constants.js";
export type { SecuGenProduct, ScannerOptions, DecodeOptions, DecodedFingerprint, BiometricCaptureResult, ResolvedScannerOptions, ControlTransferSetup, } from "./types.js";
//# sourceMappingURL=index.d.ts.map