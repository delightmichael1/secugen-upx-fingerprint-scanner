/**
 * SecuGen UPx-family WebUSB scanner driver.
 *
 * Captures a fingerprint frame by replaying the reverse-engineered protocol:
 * init block → streaming setup → exposure/gain register writes → warmup
 * capture (drained) → LED on → real capture → LED off. All protocol constants
 * and tuning values are configurable via {@link ScannerOptions}. The connected
 * product (HUPx / UPx-AP) is auto-detected from `USBDevice.productId`.
 */
import { DEFAULT_SCANNER_OPTIONS, SCANNER_PRODUCTS, SECUGEN_HUPX_PRODUCT_ID, SECUGEN_PRODUCT_ID, SECUGEN_UPXAP_PRODUCT_ID, SECUGEN_VENDOR_ID, getScannerProduct, } from "./constants.js";
import { decodeRawImage } from "./decode.js";
const hexToBytes = (hex) => {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Merges user {@link ScannerOptions} onto the verified defaults. */
export const resolveScannerOptions = (options = {}) => {
    const d = DEFAULT_SCANNER_OPTIONS;
    // The connected product (HUPx vs UPx-AP) only changes the geometry — the
    // frame-bytes default follows the product when the caller didn't override it.
    const product = getScannerProduct(options.productId);
    const initBlock = typeof options.initBlock === "string"
        ? hexToBytes(options.initBlock)
        : options.initBlock instanceof Uint8Array
            ? options.initBlock
            : hexToBytes(d.initBlock);
    return {
        vendorId: options.vendorId ?? d.vendorId,
        productId: options.productId ?? d.productId,
        interfaceNumber: options.interfaceNumber ?? d.interfaceNumber,
        configurationValue: options.configurationValue ?? d.configurationValue,
        bulkEndpoint: options.bulkEndpoint ?? d.bulkEndpoint,
        requestType: options.requestType ?? d.requestType,
        recipient: options.recipient ?? d.recipient,
        request: options.request ?? d.request,
        controlIndex: options.controlIndex ?? d.controlIndex,
        commandWindow: options.commandWindow ?? d.commandWindow,
        registerWindow: options.registerWindow ?? d.registerWindow,
        initWindow: options.initWindow ?? d.initWindow,
        initBlock,
        setupCommand: options.setupCommand
            ? [...options.setupCommand]
            : [...d.setupCommand],
        captureCommand: options.captureCommand
            ? [...options.captureCommand]
            : [...d.captureCommand],
        ledBrightnessCommand: options.ledBrightnessCommand
            ? [...options.ledBrightnessCommand]
            : [...d.ledBrightnessCommand],
        ledOnCommand: options.ledOnCommand ? [...options.ledOnCommand] : [...d.ledOnCommand],
        ledOffCommand: options.ledOffCommand ? [...options.ledOffCommand] : [...d.ledOffCommand],
        registerWriteTemplate: options.registerWriteTemplate
            ? [...options.registerWriteTemplate]
            : [...d.registerWriteTemplate],
        exposureRegisters: options.exposureRegisters
            ? options.exposureRegisters.map(([reg, val]) => [reg, val])
            : [...d.exposureRegisters].map(([reg, val]) => [reg, val]),
        warmupCapture: options.warmupCapture ?? d.warmupCapture,
        ledHoldMs: options.ledHoldMs ?? d.ledHoldMs,
        captureTimeoutMs: options.captureTimeoutMs ?? d.captureTimeoutMs,
        expectedFrameBytes: options.expectedFrameBytes ?? product.frameBytes,
    };
};
/**
 * Resolves the scanner + decode geometry for a *connected* device: the product
 * profile (HUPx vs UPx-AP) is detected from `device.productId`, and the frame
 * size defaults to that product's geometry unless the caller overrode it.
 */
export const resolveScannerOptionsForDevice = (device, options = {}) => {
    const product = getScannerProduct(options.productId ?? device.productId);
    const scan = resolveScannerOptions({
        ...options,
        productId: product.productId,
        expectedFrameBytes: options.expectedFrameBytes ?? product.frameBytes,
    });
    return {
        scan,
        decode: {
            headerBytes: product.headerBytes,
            width: product.width,
            height: product.height,
        },
        product,
    };
};
const withTimeout = (promise, ms) => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Scanner capture timed out")), ms);
        promise.then((val) => {
            clearTimeout(timer);
            resolve(val);
        }, (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
};
/**
 * Scanner driver bound to a WebUSB device. Create one with `new SecuGenScanner(device, options)`
 * or the {@link createScanner} / {@link openScanner} helpers. The product
 * (HUPx / UPx-AP) is auto-detected from the device; pass an explicit
 * `productId` in {@link ScannerOptions} to override.
 */
export class SecuGenScanner {
    constructor(device, options = {}) {
        this.device = device;
        this.opts = resolveScannerOptions({
            ...options,
            productId: options.productId ?? device.productId,
        });
        this.product = getScannerProduct(this.opts.productId);
    }
    /** The resolved options (defaults merged with any overrides). */
    get options() {
        return this.opts;
    }
    /** The detected product profile (HUPx / UPx-AP). */
    get productInfo() {
        return this.product;
    }
    ctlSetup(window) {
        return {
            requestType: this.opts.requestType,
            recipient: this.opts.recipient,
            request: this.opts.request,
            value: window,
            index: this.opts.controlIndex,
        };
    }
    /** Sends an 11-byte command on the given window (default: command window). */
    sendCommand(payload, window = this.opts.commandWindow) {
        return this.device
            .controlTransferOut(this.ctlSetup(window), new Uint8Array(payload))
            .then(() => undefined);
    }
    /** Writes one register on the register window using the write template. */
    writeRegister(reg, val) {
        const payload = [...this.opts.registerWriteTemplate];
        payload[2] = reg;
        payload[3] = val;
        return this.sendCommand(payload, this.opts.registerWindow);
    }
    /**
     * Reads one frame from the bulk IN endpoint. The device streams the frame
     * as one transfer (many URBs), which ends with a USB short packet (or
     * zero-length packet). We read until that end marker rather than demanding
     * an exact frame size — the product geometry is only a *hint* (used to
     * sanity-check + decode), so a real HUPx/UPx-AP frame of slightly different
     * size still completes instead of hanging into the timeout.
     */
    async captureBulk(expectedLength = this.opts.expectedFrameBytes) {
        // Safety ceiling for a single transfer — generous, never waits past EOF.
        const frameCap = Math.max(expectedLength, 1 << 20);
        const chunks = [];
        let received = 0;
        let want = frameCap;
        while (received < frameCap) {
            const result = await this.device.transferIn(this.opts.bulkEndpoint, want);
            const view = result.data;
            const chunk = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
            if (chunk.byteLength === 0) {
                break; // zero-length packet = end of frame
            }
            chunks.push(chunk);
            received += chunk.byteLength;
            if (chunk.byteLength < want) {
                break; // short packet = end of frame
            }
        }
        if (received === 0) {
            throw new Error(`Short frame: no data received (expected around ${expectedLength} bytes)`);
        }
        const out = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
            out.set(c, offset);
            offset += c.byteLength;
        }
        return out;
    }
    /** Drains the warmup capture frame (may arrive truncated; discarded). */
    async drainWarmup() {
        try {
            await this.captureBulk();
        }
        catch {
            // Warmup frame is intentionally discarded.
        }
    }
    /** Opens the device, selects the configuration and claims the interface. */
    async open() {
        const device = this.device;
        if (!device.opened) {
            await device.open();
        }
        if (!device.configuration) {
            await device.selectConfiguration(this.opts.configurationValue);
        }
        await device.claimInterface(this.opts.interfaceNumber);
    }
    /** Releases the interface and closes the device. */
    async close() {
        const device = this.device;
        try {
            await device.releaseInterface(this.opts.interfaceNumber);
        }
        catch { }
        try {
            await device.close();
        }
        catch { }
    }
    /**
     * Runs the full capture sequence and returns the raw frame
     * (header + pixels, e.g. 1,400,012 bytes).
     */
    async capture() {
        const run = async () => {
            const device = this.device;
            // 1. Init block — arms the sensor.
            await device.controlTransferOut(this.ctlSetup(this.opts.initWindow), this.opts.initBlock);
            // 2. Streaming setup command.
            await this.sendCommand(this.opts.setupCommand);
            // 3. Exposure / gain register writes.
            for (const [reg, val] of this.opts.exposureRegisters) {
                await this.writeRegister(reg, val);
            }
            // 4. Warmup capture (frame discarded).
            if (this.opts.warmupCapture) {
                await this.sendCommand(this.opts.captureCommand);
                await this.drainWarmup();
            }
            // 5. LED on for the real capture. Held for a visible window and to let
            //    the finger settle on the platen.
            await this.sendCommand(this.opts.ledBrightnessCommand);
            await this.sendCommand(this.opts.ledOnCommand);
            if (this.opts.ledHoldMs > 0) {
                await delay(this.opts.ledHoldMs);
            }
            // 6. Real capture + frame read.
            await this.sendCommand(this.opts.captureCommand);
            const frame = await this.captureBulk();
            // 7. LED off.
            await this.sendCommand(this.opts.ledOffCommand);
            return frame;
        };
        return withTimeout(run(), this.opts.captureTimeoutMs);
    }
    /**
     * Captures and decodes in one call, returning a {@link DecodedFingerprint}.
     * Pass {@link DecodeOptions} to tune contrast / polarity / orientation.
     * Width/height/header default to the detected product's geometry.
     */
    async scan(decodeOptions = {}) {
        const frame = await this.capture();
        return decodeRawImage(frame, {
            headerBytes: decodeOptions.headerBytes ?? this.product.headerBytes,
            width: decodeOptions.width ?? this.product.width,
            height: decodeOptions.height ?? this.product.height,
            fill: decodeOptions.fill,
            invert: decodeOptions.invert,
            rotate: decodeOptions.rotate,
            gamma: decodeOptions.gamma,
        });
    }
}
// ─── Free functions (match the original module API) ───────────────────────────
/** Checks if WebUSB is supported in the current browser environment. */
export const isWebUsbSupported = () => typeof navigator !== "undefined" && "usb" in navigator;
/** Prompts the user to pick the SecuGen scanner from the WebUSB chooser. */
export const requestScannerDevice = async (options = {}) => {
    const { vendorId } = resolveScannerOptions(options);
    return navigator.usb.requestDevice({
        filters: [
            // Every supported SecuGen UPx-family product, plus a vendor-wide fallback.
            ...SCANNER_PRODUCTS.map((p) => ({
                vendorId,
                productId: p.productId,
            })),
            { vendorId },
        ],
    });
};
/** Finds a previously-granted SecuGen scanner without prompting the user. */
export const getGrantedScannerDevice = async (options = {}) => {
    const { vendorId, productId } = resolveScannerOptions(options);
    const devices = await navigator.usb.getDevices();
    return (
    // Exact product match first, then any other granted SecuGen device (so a
    // switch from UPx-AP to HUPx still restores automatically).
    devices.find((d) => d.vendorId === vendorId && d.productId === productId) ??
        devices.find((d) => d.vendorId === vendorId) ??
        null);
};
/** Resolves the product profile for a connected device (HUPx / UPx-AP). */
export const detectProduct = (device, options = {}) => getScannerProduct(options.productId ?? device.productId);
/** Opens the device and claims the interface. */
export const openScanner = async (device, options = {}) => new SecuGenScanner(device, options).open();
/** Releases the interface and closes the device. */
export const closeScanner = async (device) => new SecuGenScanner(device).close();
/** Runs the full capture sequence and returns the raw frame. */
export const scanFingerprint = async (device, options = {}) => new SecuGenScanner(device, options).capture();
/** Reads a raw frame from the bulk IN endpoint. */
export const captureBulk = async (device, expectedLength, options = {}) => new SecuGenScanner(device, options).captureBulk(expectedLength);
/** Captures a frame and decodes it in one call. */
export const scanAndDecode = async (device, scanOptions = {}, decodeOptions = {}) => new SecuGenScanner(device, scanOptions).scan(decodeOptions);
/** Convenience factory for a configured scanner instance. */
export const createScanner = (device, options = {}) => new SecuGenScanner(device, options);
// Re-export the vendor/product ids so callers don't hardcode magic numbers.
export { SECUGEN_PRODUCT_ID, SECUGEN_VENDOR_ID, SECUGEN_HUPX_PRODUCT_ID, SECUGEN_UPXAP_PRODUCT_ID, SCANNER_PRODUCTS, getScannerProduct, };
//# sourceMappingURL=scanner.js.map