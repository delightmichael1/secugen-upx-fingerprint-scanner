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

export const SECUGEN_VENDOR_ID = 0x1162;
export const SECUGEN_UPXAP_PRODUCT_ID = 0x2310; // UPx-AP (Hamster Pro V2)
export const SECUGEN_HUPX_PRODUCT_ID = 0x2201; // HUPx (Hamster Pro, "UPx class")

/** @deprecated Use {@link SECUGEN_UPXAP_PRODUCT_ID}. */
export const SECUGEN_PRODUCT_ID = SECUGEN_UPXAP_PRODUCT_ID;

/** Bulk IN endpoint used for image data (0x82). */
export const BULK_ENDPOINT = 2;

/** Frame layout: 12-byte header + 1400×1000 quincunx samples. */
export const UPXAP_HEADER_BYTES = 12;
export const UPXAP_WIDTH = 1400;
export const UPXAP_HEIGHT = 1000;
export const UPXAP_FRAME_BYTES = UPXAP_HEADER_BYTES + UPXAP_WIDTH * UPXAP_HEIGHT; // 1,400,012

/** Frame layout: 12-byte header + 260×300 quincunx samples. */
export const HUPX_HEADER_BYTES = 12;
export const HUPX_WIDTH = 260;
export const HUPX_HEIGHT = 300;
export const HUPX_FRAME_BYTES = HUPX_HEADER_BYTES + HUPX_WIDTH * HUPX_HEIGHT; // 78,012

/**
 * Registry of supported SecuGen UPx-family products. Auto-selected by
 * `USBDevice.productId`; the default (UPx-AP, matching the original driver)
 * is kept as the fallback for backward compatibility.
 */
export const SCANNER_PRODUCTS: readonly SecuGenProduct[] = [
  {
    productId: SECUGEN_HUPX_PRODUCT_ID,
    name: "HUPx",
    headerBytes: HUPX_HEADER_BYTES,
    width: HUPX_WIDTH,
    height: HUPX_HEIGHT,
    frameBytes: HUPX_FRAME_BYTES,
  },
  {
    productId: SECUGEN_UPXAP_PRODUCT_ID,
    name: "UPx-AP",
    headerBytes: UPXAP_HEADER_BYTES,
    width: UPXAP_WIDTH,
    height: UPXAP_HEIGHT,
    frameBytes: UPXAP_FRAME_BYTES,
  },
];

/** Looks up the product profile for a USB product id (defaults to UPx-AP). */
export const getScannerProduct = (
  productId?: number,
): SecuGenProduct =>
  SCANNER_PRODUCTS.find((p) => p.productId === productId) ??
  SCANNER_PRODUCTS[SCANNER_PRODUCTS.length - 1];

/**
 * Fixed 516-byte sensor init block captured from the vendor demo app (arms the
 * sensor). Sent once per capture on the init window.
 */
export const DEFAULT_INIT_BLOCK_HEX =
  "001e7e9e7502000095030e8bff7f0000000000000000000000000000000000000100000000000000" +
  "988a008cff7f0000301c09ce7502000070be2490ff7f00000000000000000000213b008cff7f0000" +
  "14ceca04dee40000213b008cff7f000090ee158bff7f000070be2490ff7f000080ba42ce75020000" +
  "70be2490ff7f00007fba42ce750200000e0000000000000090ee158bff7f0000408b42ce75020000" +
  "70b142ce75020000ef5a0e8bff7f00009f260ace75020000150000000000000000100ace75020000" +
  "213b008cff7f000000100ace75020000aad12490ff7f000014002200000000003000000000000000" +
  "b0ab08ce75020000b0b70ace7502000080ba42ce7502000011ab2490ff7f00000000000000000000" +
  "2010f9cd75020000b0080f8bff7f0000b0b70ace75020000ac02f9cd750200003000000000000000" +
  "c00cf9cd750200008384018075020000c8eb3730d30000001e000000000000000000000000000000" +
  "300000000000000000000000000000000300000000000000000000000000000089eb3730d3000000" +
  "000006ce75020000bac72490ff7f00000000f9cd7502000000000000000000001e00000000000000" +
  "0000000000000000c00cf9cd75020000000000000000000002000000750200000401000000000000" +
  "000000000000000010010000000000000000000000000000000000000000000000000000";

/** 11-byte command payloads (opcode in byte[2], params in byte[3..10]). */
export const DEFAULT_SETUP_COMMAND = [0x81, 0x0b, 0x78, 0x04, 0x00, 0x00, 0x00, 0x00, 0x10, 0x01, 0x00] as const;
export const DEFAULT_CAPTURE_COMMAND = [0x81, 0x0b, 0x78, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] as const;
export const DEFAULT_LED_BRIGHTNESS_COMMAND = [0x01, 0x0b, 0x8f, 0x40, 0x00, 0x06, 0x0b, 0x00, 0xc0, 0x19, 0x09] as const;
export const DEFAULT_LED_ON_COMMAND = [0x81, 0x0b, 0x8e, 0x01, 0x00, 0x06, 0x0b, 0x00, 0xc0, 0x19, 0x09] as const;
export const DEFAULT_LED_OFF_COMMAND = [0x81, 0x0b, 0x8e, 0x00, 0x00, 0x06, 0x0b, 0x00, 0x60, 0x65, 0x08] as const;

/**
 * 11-byte register-write template. Bytes 2 and 3 are overwritten with the
 * register address and value before sending on the register window.
 */
export const DEFAULT_REGISTER_WRITE_TEMPLATE = [0x81, 0x00, 0x00, 0x00, 0x00, 0x06, 0x0b, 0x00, 0x00, 0x00, 0x00] as const;

/**
 * Exposure / gain register pairs written before each capture. Tuned on
 * hardware (verified: 0x0a=0x80 gain, 0x0c=0x80 exposure, 0x04=0xa7) to match
 * the vendor demo app's contrast — the `exp_80_80_a7` profile.
 */
export const DEFAULT_EXPOSURE_REGISTERS: ReadonlyArray<readonly [number, number]> = [
  [0xfe, 0x00],
  [0x09, 0x00],
  [0x0a, 0x80],
  [0x0b, 0x00],
  [0x0c, 0x80],
  [0xfe, 0x00],
  [0x03, 0x01],
  [0x04, 0xa7],
];

/** Default transfer windows and request bytes. */
export const DEFAULT_SCANNER_OPTIONS = {
  vendorId: SECUGEN_VENDOR_ID,
  productId: SECUGEN_PRODUCT_ID,
  interfaceNumber: 0,
  configurationValue: 1,
  bulkEndpoint: BULK_ENDPOINT,
  requestType: "class",
  recipient: "interface",
  request: 0x01,
  controlIndex: 0x0600,
  commandWindow: 0x0600,
  registerWindow: 0x0700,
  initWindow: 0x1800,
  initBlock: DEFAULT_INIT_BLOCK_HEX,
  setupCommand: DEFAULT_SETUP_COMMAND,
  captureCommand: DEFAULT_CAPTURE_COMMAND,
  ledBrightnessCommand: DEFAULT_LED_BRIGHTNESS_COMMAND,
  ledOnCommand: DEFAULT_LED_ON_COMMAND,
  ledOffCommand: DEFAULT_LED_OFF_COMMAND,
  registerWriteTemplate: DEFAULT_REGISTER_WRITE_TEMPLATE,
  exposureRegisters: DEFAULT_EXPOSURE_REGISTERS,
  warmupCapture: true,
  ledHoldMs: 700,
  captureTimeoutMs: 45000,
  expectedFrameBytes: UPXAP_FRAME_BYTES,
} as const;

/** Default decoder behaviour (see DecodeOptions). */
export const DEFAULT_DECODE_OPTIONS = {
  headerBytes: UPXAP_HEADER_BYTES,
  width: UPXAP_WIDTH,
  height: UPXAP_HEIGHT,
  fill: "orthogonal-mean",
  invert: true,
  rotate: 180,
  gamma: { target: 200, min: 0.5, max: 2.2 },
} as const;
