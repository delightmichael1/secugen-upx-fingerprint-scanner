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
export const HUPX_HEADER_BYTES = 0;
export const HUPX_WIDTH = 552;
export const HUPX_HEIGHT = 356;
export const HUPX_TRAILING_BYTES = 96;
export const HUPX_FRAME_BYTES = HUPX_HEADER_BYTES + HUPX_WIDTH * HUPX_HEIGHT + HUPX_TRAILING_BYTES; // 196,608
// ── HUPx register protocol ──────────────────────────────────────────────────
// All vendor ops use bmRequestType 0x40 (OUT) / 0xc0 (IN), i.e. WebUSB
// requestType "vendor" + recipient "device", with these bRequests:
/** bRequest for register reads/writes; wValue is always {@link HUPX_REGISTER_VALUE}. */
export const HUPX_REGISTER_REQUEST = 0x22;
/** wValue carried by every register access. wIndex = the register address. */
export const HUPX_REGISTER_VALUE = 0x0033;
/** TRIG — starts a capture (OUT, wVal 0x0001). */
export const HUPX_TRIGGER_REQUEST = 0x05;
export const HUPX_TRIGGER_VALUE = 0x0001;
/** Status poll (IN, wIdx 0x2000, wLen 10). */
export const HUPX_STATUS_REQUEST = 0x08;
export const HUPX_STATUS_INDEX = 0x2000;
export const HUPX_STATUS_LENGTH = 10;
/** cmd01 — opens the readout gate (OUT, wVal 0) BEFORE the bulk image read. */
export const HUPX_CMD01_REQUEST = 0x01;
/** cmd02 — closes the readout gate (OUT, wVal 0) AFTER the bulk image read. */
export const HUPX_CMD02_REQUEST = 0x02;
/**
 * cmd11 — LED gate (OUT, wVal {@link HUPX_LED_ON_VALUE} / {@link HUPX_LED_OFF_VALUE}).
 * Confirmed from the demo capture: wVal 0x0001 right before the real (long-exposure)
 * capture pass, wVal 0x0000 after it. Without this the platen LED never lights and
 * the resulting frame is dark.
 */
export const HUPX_CMD11_REQUEST = 0x11;
export const HUPX_LED_ON_VALUE = 0x0001;
export const HUPX_LED_OFF_VALUE = 0x0000;
/** Image-ready status poll used around the real capture pass (IN, wIdx 0, wLen 4). */
export const HUPX_STATUS_POLL_REQUEST = 0x16;
export const HUPX_STATUS_POLL_LENGTH = 4;
/**
 * HUPx register init sequence captured from the vendor demo app (first capture
 * cycle, ~150 registers). Each is written then read back to verify. This arms
 * the sensor: sensor timing/exposure LUT registers, DPI scaling tables, and
 * the final R3/R122/R123/R124 values that gate the readout.
 */
export const HUPX_INIT_REGISTERS = [
    [0x04, 0x02],
    [0x05, 0x07],
    [0x11, 0x04],
    [0x12, 0x0a],
    [0x13, 0x1f],
    [0x16, 0x89],
    [0x1b, 0x90],
    [0x1f, 0x52],
    [0x22, 0x00],
    [0x25, 0x00],
    [0x30, 0x05],
    [0x31, 0x14],
    [0x32, 0x00],
    [0x40, 0x00],
    [0x43, 0xc0],
    [0x44, 0x48],
    [0x45, 0x28],
    [0x46, 0x08],
    [0x47, 0x15],
    [0x48, 0x1e],
    [0x49, 0x13],
    [0x4a, 0x63],
    [0x4b, 0xc4],
    [0x4c, 0x3c],
    [0x4e, 0x17],
    [0x4f, 0x8a],
    [0x50, 0x94],
    [0x5a, 0x00],
    [0x60, 0x00],
    [0x61, 0x08],
    [0x62, 0x01],
    [0x63, 0x7f],
    [0x64, 0x80],
    [0x65, 0xd0],
    [0x66, 0x8c],
    [0x67, 0xc8],
    [0x68, 0x8b],
    [0x69, 0x8a],
    [0x6a, 0x73],
    [0x6b, 0x90],
    [0x6c, 0x70],
    [0x6d, 0x88],
    [0x6e, 0x77],
    [0x6f, 0x46],
    [0x70, 0xea],
    [0x71, 0x60],
    [0x72, 0x05],
    [0x73, 0x02],
    [0x74, 0x0c],
    [0x75, 0x0f],
    [0x76, 0x20],
    [0x77, 0xb7],
    [0x78, 0x97],
    [0x80, 0x8f],
    [0x81, 0x0c],
    [0x82, 0x3a],
    [0x83, 0x00],
    [0x84, 0x50],
    [0x86, 0xa1],
    [0x87, 0x04],
    [0x88, 0x28],
    [0x89, 0x0f],
    [0x92, 0x00],
    [0x93, 0x10],
    [0x94, 0x1d],
    [0x95, 0x40],
    [0x96, 0x10],
    [0x97, 0x1d],
    [0x98, 0x40],
    [0x99, 0x24],
    [0x9a, 0x50],
    [0xa4, 0xdd],
    [0xa5, 0xdd],
    [0xa6, 0xdd],
    [0xa7, 0xdc],
    [0xa8, 0xba],
    [0xa9, 0x00],
    [0xaa, 0x00],
    [0xab, 0x00],
    [0xac, 0x00],
    [0xad, 0x00],
    [0xae, 0x00],
    [0xaf, 0x98],
    [0xb0, 0x90],
    [0xb1, 0x00],
    [0xb2, 0x04],
    [0xb3, 0x0c],
    [0xb4, 0x22],
    [0xb5, 0x42],
    [0xb6, 0x5d],
    [0xb7, 0x72],
    [0xb8, 0x86],
    [0xb9, 0x97],
    [0xba, 0xa5],
    [0xbb, 0xb2],
    [0xbc, 0xc9],
    [0xbd, 0xdd],
    [0xbe, 0xf0],
    [0xbf, 0xf8],
    [0xc0, 0xff],
    [0xc1, 0x20],
    [0xc2, 0xe5],
    [0xc3, 0xfb],
    [0xc4, 0x13],
    [0xc5, 0x25],
    [0xc6, 0x07],
    [0xc7, 0xf5],
    [0xc8, 0xeb],
    [0xc9, 0x20],
    [0xca, 0xc0],
    [0xcb, 0x08],
    [0xcc, 0x08],
    [0xcd, 0x05],
    [0xce, 0x05],
    [0xcf, 0x18],
    [0xd0, 0x20],
    [0xd1, 0x24],
    [0xd2, 0x66],
    [0xd3, 0x00],
    [0xd4, 0x10],
    [0xd5, 0x10],
    [0xd6, 0x10],
    [0xd7, 0x00],
    [0xd8, 0x00],
    [0xd9, 0x00],
    [0xda, 0x00],
    [0xdb, 0xff],
    [0xdc, 0x0a],
    [0xdd, 0xff],
    [0xde, 0x00],
    [0xdf, 0xff],
    [0xe0, 0x00],
    [0xe1, 0x28],
    [0xe2, 0x46],
    [0xf0, 0x24],
    [0xf1, 0x00],
    [0xf2, 0x80],
    [0xf3, 0x00],
    [0xf4, 0xe0],
    [0x03, 0x05],
    [0x7a, 0x90],
    [0x7b, 0xb0],
    [0x7c, 0x80],
];
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
export const HUPX_EXPOSURE_REGISTERS = [
    [0xf0, 0x24],
    [0xf1, 0x30],
    [0xf2, 0x28],
    [0xf3, 0x24],
    [0xf4, 0x66],
];
/**
 * HUPx long-exposure gain registers (R48/R49 = 0x30/0x31 = 0x02/0x58), written
 * after the pass-2 TRIG (and again after the LED comes on), matching the demo.
 */
export const HUPX_CAPTURE_GAIN_REGISTERS = [
    [0x30, 0x02],
    [0x31, 0x58],
];
/**
 * HUPx short-exposure gain registers for the discarded calibrate/warmup pass.
 * The demo writes R48/R49 = 0x01/0x2c (short exposure) for the first frame of
 * each scan, then switches to the long-exposure profile
 * ({@link HUPX_EXPOSURE_REGISTERS}) for the real capture.
 */
export const HUPX_CALIBRATE_GAIN_REGISTERS = [
    [0x30, 0x01],
    [0x31, 0x2c],
];
/**
 * Registry of supported SecuGen UPx-family products. Auto-selected by
 * `USBDevice.productId`; the default (UPx-AP, matching the original driver)
 * is kept as the fallback for backward compatibility.
 */
export const DEFAULT_EXPOSURE_REGISTERS = [
    [0xfe, 0x00],
    [0x09, 0x00],
    [0x0a, 0x80],
    [0x0b, 0x00],
    [0x0c, 0x80],
    [0xfe, 0x00],
    [0x03, 0x01],
    [0x04, 0xa7],
];
/**
 * Registry of supported SecuGen UPx-family products. Auto-selected by
 * `USBDevice.productId`; the default (UPx-AP, matching the original driver)
 * is kept as the fallback for backward compatibility.
 */
export const SCANNER_PRODUCTS = [
    {
        productId: SECUGEN_HUPX_PRODUCT_ID,
        name: "HUPx",
        protocol: "register",
        sampling: "plain",
        headerBytes: HUPX_HEADER_BYTES,
        width: HUPX_WIDTH,
        height: HUPX_HEIGHT,
        frameBytes: HUPX_FRAME_BYTES,
        exposureRegisters: HUPX_EXPOSURE_REGISTERS,
        // Unverified against the official SDK (no reference capture yet), so the
        // historical orientation is kept and no resolution is claimed.
        orientation: "rotate-180",
    },
    {
        productId: SECUGEN_UPXAP_PRODUCT_ID,
        name: "UPx-AP",
        protocol: "class-command",
        sampling: "quincunx",
        headerBytes: UPXAP_HEADER_BYTES,
        width: UPXAP_WIDTH,
        height: UPXAP_HEIGHT,
        frameBytes: UPXAP_FRAME_BYTES,
        exposureRegisters: DEFAULT_EXPOSURE_REGISTERS,
        // Calibrated against an ISO 19794-2 template the official SecuGen stack
        // (Nexus dashboard) produced for the same finger: the SecuGen matcher only
        // scores the pair as the same finger (192/199) with a vertical flip — a
        // 180° rotation gives the mirror image — and with this anisotropic grid
        // (a minutiae affine fit puts it at ~1800 × ~1160 dpi, ±4%).
        orientation: "flip-vertical",
        resolutionDpi: { x: 1800, y: 1160 },
    },
];
/** Looks up the product profile for a USB product id (defaults to UPx-AP). */
export const getScannerProduct = (productId) => SCANNER_PRODUCTS.find((p) => p.productId === productId) ??
    SCANNER_PRODUCTS[SCANNER_PRODUCTS.length - 1];
/**
 * Fixed 516-byte sensor init block captured from the vendor demo app (arms the
 * sensor). Sent once per capture on the init window.
 */
export const DEFAULT_INIT_BLOCK_HEX = "001e7e9e7502000095030e8bff7f0000000000000000000000000000000000000100000000000000" +
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
export const DEFAULT_SETUP_COMMAND = [
    0x81, 0x0b, 0x78, 0x04, 0x00, 0x00, 0x00, 0x00, 0x10, 0x01, 0x00,
];
export const DEFAULT_CAPTURE_COMMAND = [
    0x81, 0x0b, 0x78, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];
export const DEFAULT_LED_BRIGHTNESS_COMMAND = [
    0x01, 0x0b, 0x8f, 0x40, 0x00, 0x06, 0x0b, 0x00, 0xc0, 0x19, 0x09,
];
export const DEFAULT_LED_ON_COMMAND = [
    0x81, 0x0b, 0x8e, 0x01, 0x00, 0x06, 0x0b, 0x00, 0xc0, 0x19, 0x09,
];
export const DEFAULT_LED_OFF_COMMAND = [
    0x81, 0x0b, 0x8e, 0x00, 0x00, 0x06, 0x0b, 0x00, 0x60, 0x65, 0x08,
];
/**
 * 11-byte register-write template. Bytes 2 and 3 are overwritten with the
 * register address and value before sending on the register window.
 */
export const DEFAULT_REGISTER_WRITE_TEMPLATE = [
    0x81, 0x00, 0x00, 0x00, 0x00, 0x06, 0x0b, 0x00, 0x00, 0x00, 0x00,
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
    protocol: "class-command",
    register: {
        request: HUPX_REGISTER_REQUEST,
        value: HUPX_REGISTER_VALUE,
        verify: true,
        triggerRequest: HUPX_TRIGGER_REQUEST,
        triggerValue: HUPX_TRIGGER_VALUE,
        statusRequest: HUPX_STATUS_REQUEST,
        statusIndex: HUPX_STATUS_INDEX,
        statusLength: HUPX_STATUS_LENGTH,
        cmd01Request: HUPX_CMD01_REQUEST,
        cmd02Request: HUPX_CMD02_REQUEST,
        cmd11Request: HUPX_CMD11_REQUEST,
        ledOnValue: HUPX_LED_ON_VALUE,
        ledOffValue: HUPX_LED_OFF_VALUE,
        statusPollRequest: HUPX_STATUS_POLL_REQUEST,
        statusPollLength: HUPX_STATUS_POLL_LENGTH,
        calibrateGainRegisters: HUPX_CALIBRATE_GAIN_REGISTERS,
        captureGainRegisters: HUPX_CAPTURE_GAIN_REGISTERS,
        initRegisters: HUPX_INIT_REGISTERS,
    },
};
/** Default decoder behaviour (see DecodeOptions). */
/**
 * Standard SecuGen image (what SGFPM_GetImage returns, and the geometry in
 * the Nexus switch's own ISO/IEC 19794-2 templates): 300×400 at 500 dpi.
 */
export const ISO_IMAGE_WIDTH = 300;
export const ISO_IMAGE_HEIGHT = 400;
export const ISO_IMAGE_DPI = 500;
export const DEFAULT_DECODE_OPTIONS = {
    headerBytes: UPXAP_HEADER_BYTES,
    sampling: "quincunx",
    width: UPXAP_WIDTH,
    height: UPXAP_HEIGHT,
    fill: "orthogonal-mean",
    invert: true,
    orientation: "flip-vertical",
    gamma: { target: 200, min: 0.5, max: 2.2 },
    contrast: { lowPercentile: 1, highPercentile: 99 },
};
//# sourceMappingURL=constants.js.map