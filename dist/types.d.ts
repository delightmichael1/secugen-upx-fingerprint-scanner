/**
 * Ambient WebUSB types and public option interfaces for the SecuGen UPx-AP
 * fingerprint scanner package.
 *
 * WebUSB is not part of the standard TypeScript DOM lib, so the minimal set of
 * interfaces needed by this package is declared globally (matching the W3C
 * WebUSB specification). Consumers only need a browser with `navigator.usb`.
 */
declare global {
    interface USBEndpoint {
        direction: string;
        type: string;
        endpointNumber: number;
    }
    interface USBAlternate {
        endpoints: USBEndpoint[];
    }
    interface USBInterface {
        interfaceNumber: number;
        alternates: USBAlternate[];
    }
    interface USBConfiguration {
        interfaces: USBInterface[];
    }
    interface USBDevice {
        opened: boolean;
        vendorId: number;
        productId: number;
        productName?: string;
        manufacturerName?: string;
        configuration?: USBConfiguration;
        open(): Promise<void>;
        close(): Promise<void>;
        selectConfiguration(configurationValue: number): Promise<void>;
        claimInterface(interfaceNumber: number): Promise<void>;
        releaseInterface(interfaceNumber: number): Promise<void>;
        controlTransferIn(setup: USBControlTransferSetup, length: number): Promise<{
            data: DataView;
        }>;
        controlTransferOut(setup: USBControlTransferSetup, data?: BufferSource): Promise<{
            status: string;
            bytesWritten: number;
        }>;
        transferIn(endpointNumber: number, length: number): Promise<{
            data: DataView;
            status: string;
        }>;
    }
    interface USBControlTransferSetup {
        requestType: string;
        recipient: string;
        request: number;
        value: number;
        index: number;
    }
    interface Navigator {
        usb: {
            requestDevice(options: {
                filters: Array<{
                    vendorId: number;
                    productId?: number;
                }>;
            }): Promise<USBDevice>;
            getDevices(): Promise<USBDevice[]>;
        };
    }
}
/** Control transfer fields shared by every UPx-AP vendor command. */
export interface ControlTransferSetup {
    requestType: string;
    recipient: string;
    request: number;
    value: number;
    index: number;
}
/**
 * A supported SecuGen product in the UPx family. Products differ in sensor
 * geometry (frame bytes, image dimensions) AND capture protocol — UPx-AP uses
 * the vendor-class command protocol with quincunx sampling, HUPx uses the
 * register-based protocol with plain 8-bit row-major frames.
 */
export interface SecuGenProduct {
    /** USB product id (`USBDevice.productId`). */
    productId: number;
    /** Short product name, e.g. "HUPx" or "UPx-AP". */
    name: string;
    /**
     * Capture protocol. "class-command" = vendor-class commands on the
     * command/register/init windows (UPx-AP); "register" = register envelope
     * bRequest 0x22 / wValue 0x0033 with read-back verify + TRIG/status/cmd01/
     * cmd02 gates (HUPx).
     */
    protocol: "class-command" | "register";
    /** Decoder sampling layout of the raw frame. */
    sampling: "quincunx" | "plain";
    /** Bytes at the front of the raw frame before the pixel matrix. */
    headerBytes: number;
    /** Image width in pixels. */
    width: number;
    /** Image height in pixels. */
    height: number;
    /** Total expected raw frame size in bytes (header + width × height). */
    frameBytes: number;
    /**
     * Product-appropriate exposure / gain registers written before each capture.
     * HUPx uses the "long exposure" profile (R240-244 + R48/49); UPx-AP uses
     * the class-command exposure registers via the register window.
     */
    exposureRegisters: ReadonlyArray<readonly [number, number]>;
    /** Orientation fix the decoder applies for this product (see {@link DecodeOptions.orientation}). */
    orientation: FrameOrientation;
    /**
     * True sampling resolution of the decoded grid, in dots per inch per axis.
     * Calibrated by matching our extraction against templates the official
     * SecuGen stack produced for the same finger; {@link toIsoImage} uses it to
     * resample to a true 500 dpi. Undefined while a product is uncalibrated.
     */
    resolutionDpi?: {
        x: number;
        y: number;
    };
}
/**
 * How the decoded grid is turned upright. "flip-vertical" reverses the row
 * order only; "rotate-180" reverses rows and columns (a mirror of
 * "flip-vertical" — getting this wrong yields a mirrored print that no other
 * system's template will ever match).
 */
export type FrameOrientation = "flip-vertical" | "rotate-180" | "none";
/**
 * Scanner tuning options. Every field has a verified SecuGen UPx-AP default
 * (see {@link DEFAULT_SCANNER_OPTIONS}); supply only the fields you want to
 * override. These map 1:1 to the reverse-engineered protocol so you can tune
 * exposure/gain, LED behaviour and transfer windows.
 */
export interface ScannerOptions {
    /** USB vendor id of the device to match (default 0x1162). */
    vendorId?: number;
    /** USB product id of the device to match (default 0x2310, UPx-AP). */
    productId?: number;
    /** USB interface claimed for the session (default 0). */
    interfaceNumber?: number;
    /** Configuration to select on open (default 1). */
    configurationValue?: number;
    /** Bulk IN endpoint that streams the image frame (default 2 → 0x82). */
    bulkEndpoint?: number;
    /** bmRequestType type nibble for all control transfers (default "class"). */
    requestType?: "standard" | "class" | "vendor";
    /** bmRequestType recipient nibble (default "interface"). */
    recipient?: "device" | "interface" | "endpoint" | "other";
    /** bRequest for all control transfers (default 0x01). */
    request?: number;
    /** wIndex used on every control transfer (default 0x0600). */
    controlIndex?: number;
    /** wValue (window) for capture / LED commands (default 0x0600). */
    commandWindow?: number;
    /** wValue (window) for register writes (default 0x0700). */
    registerWindow?: number;
    /** wValue (window) carrying the init block (default 0x1800). */
    initWindow?: number;
    /**
     * Fixed 516-byte sensor init block, as hex string or bytes. Defaults to the
     * exact block captured from the vendor demo app (arms the sensor).
     */
    initBlock?: string | Uint8Array;
    /** 11-byte streaming setup command (default 810b780400000000100100). */
    setupCommand?: readonly number[];
    /** 11-byte capture command (default 810b780300000000000000). */
    captureCommand?: readonly number[];
    /** 11-byte LED brightness command (default 010b8f4000060b00c01909). */
    ledBrightnessCommand?: readonly number[];
    /** 11-byte LED-on command (default 810b8e0100060b00c01909). */
    ledOnCommand?: readonly number[];
    /** 11-byte LED-off command (default 810b8e0000060b00606508). */
    ledOffCommand?: readonly number[];
    /**
     * 11-byte register-write template; bytes 2 and 3 are replaced with the
     * register address and value (default 8100RRVV00060b00000000).
     */
    registerWriteTemplate?: readonly number[];
    /**
     * Exposure / gain register pairs written before capture
     * (defaults to the tuned `exp_80_80_a7` values, see EXPOSURE_REGISTERS).
     */
    exposureRegisters?: ReadonlyArray<readonly [number, number]>;
    /** Perform a discard warmup capture before the real one (default true). */
    warmupCapture?: boolean;
    /** Milliseconds to hold the LED on before capturing (default 700). */
    ledHoldMs?: number;
    /** Total capture timeout in ms (default 45000). */
    captureTimeoutMs?: number;
    /** Expected raw frame size in bytes (default 1,400,012). */
    expectedFrameBytes?: number;
    /**
     * HUPx register-protocol tuning. Only used when the connected product (or an
     * explicit `productId` override) uses the register protocol. Every field has
     * a verified default captured from the vendor demo app.
     */
    register?: {
        /** bRequest for register reads/writes (default 0x22). */
        request?: number;
        /** wValue on every register access (default 0x0033). */
        value?: number;
        /** Read the register back after each write to verify (default true). */
        verify?: boolean;
        /** bRequest that triggers a capture (default 0x05, wVal 0x0001). */
        triggerRequest?: number;
        /** wValue for the trigger (default 0x0001). */
        triggerValue?: number;
        /** bRequest for the status poll (default 0x08). */
        statusRequest?: number;
        /** wIndex for the status poll (default 0x2000). */
        statusIndex?: number;
        /** wLength for the status poll (default 10). */
        statusLength?: number;
        /** bRequest that opens the readout gate before the image read (default 1). */
        cmd01Request?: number;
        /** bRequest that closes the readout gate after the image read (default 2). */
        cmd02Request?: number;
        /** bRequest that gates the platen LED (default 0x11, wVal 1/0). */
        cmd11Request?: number;
        /** wValue that turns the LED on (default 0x0001). */
        ledOnValue?: number;
        /** wValue that turns the LED off (default 0x0000). */
        ledOffValue?: number;
        /** bRequest for the image-ready status poll around the real capture (default 0x16). */
        statusPollRequest?: number;
        /** wLength for that status poll (default 4). */
        statusPollLength?: number;
        /**
         * Short-exposure gain registers written before the discarded calibrate
         * (warmup) frame of each scan — the sensor needs a first short-exposure
         * capture before the long-exposure real capture comes out sharp.
         */
        calibrateGainRegisters?: ReadonlyArray<readonly [number, number]>;
        /**
         * Long-exposure gain registers written after the pass-2 TRIG (and again
         * after the LED comes on), matching the demo (default R48/R49 = 0x02/0x58).
         */
        captureGainRegisters?: ReadonlyArray<readonly [number, number]>;
        /**
         * Register init sequence written (and verified) before each capture,
         * arming the sensor. Defaults to the full sequence captured from the demo.
         */
        initRegisters?: ReadonlyArray<readonly [number, number]>;
    };
}
/**
 * Decoder options. These control how a raw frame is turned into an 8-bit
 * grayscale image: quincunx placement, interpolation, polarity, orientation,
 * the adaptive contrast/gamma pass, and final dead-border cropping.
 */
export interface DecodeOptions {
    /** Bytes to strip from the front of the frame (default 12). */
    headerBytes?: number;
    /**
     * Pixel sampling layout of the raw frame. "quincunx" (UPx-AP) places samples
     * at `(x + y) odd` cells and interpolates the even cells; "plain" (HUPx)
     * copies the bytes row-major straight into the image. Defaults to the
     * detected product's layout.
     */
    sampling?: "quincunx" | "plain";
    /** Image width in pixels (default 1400). */
    width?: number;
    /** Image height in pixels (default 1000). */
    height?: number;
    /**
     * Fill strategy for the empty (x+y) even cells left by quincunx sampling.
     * "orthogonal-mean" averages the four orthogonal neighbours (default);
     * "none" leaves them at 0.
     */
    fill?: "orthogonal-mean" | "none";
    /** Invert polarity so ridges render dark on a light background (default true). */
    invert?: boolean;
    /**
     * Legacy orientation switch: 180 = "rotate-180", 0 = "none". Ignored when
     * {@link orientation} is set.
     */
    rotate?: 0 | 180;
    /**
     * Orientation fix applied after decode. Defaults to the UPx-AP's
     * "flip-vertical" (its sensor streams rows bottom-up but columns
     * left-to-right); pass the detected product's `orientation` for others.
     */
    orientation?: FrameOrientation;
    /**
     * Adaptive gamma that normalises the frame median to a target brightness so
     * flat / bright captures still show good contrast. Pass `null` to disable.
     */
    gamma?: {
        /** Target median brightness (default 200). */
        target?: number;
        /** Minimum gamma clamp (default 0.5). */
        min?: number;
        /** Maximum gamma clamp (default 2.2). */
        max?: number;
    } | null;
    /**
     * Adaptive contrast stretch applied AFTER gamma. Gamma alone only
     * normalises median *brightness* — on a fingerprint frame the background
     * dominates the histogram, so gamma barely touches ridge contrast and
     * captures come out soft/muddy-gray instead of true black-on-white.
     * This step finds the `lowPercentile`/`highPercentile` intensity values
     * and linearly stretches them to 0/255 (clipped), restoring the punchy
     * look of the vendor demo. Applies identically regardless of sampling
     * (quincunx or plain), so it fixes both UPx-AP and HUPx alike. Pass
     * `null` to disable.
     */
    contrast?: {
        /** Lower clip percentile, stretched to 0 (default 1). */
        lowPercentile?: number;
        /** Upper clip percentile, stretched to 255 (default 99). */
        highPercentile?: number;
    } | null;
    /**
     * Crops fixed dead-border pixels (sensor bezel / non-active rows-columns
     * / readout seam) from the final, oriented image. Margins are in pixels
     * of the *output* image (after rotate), so they match what you see on
     * screen. Omit or leave all at 0 to keep the full sensor frame (default —
     * unchanged behaviour). Use the `measureDeadBorder` diagnostic to find
     * the right numbers for your hardware before hardcoding them.
     */
    crop?: {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
    };
}
/** Result of decoding a raw frame into an 8-bit grayscale image. */
export interface DecodedFingerprint {
    /** The decoded, processed pixels (width × height bytes, row-major). */
    raw: Uint8Array;
    byteLength: number;
    width: number;
    height: number;
    /** Always 1 (grayscale). */
    channels: number;
}
/** @deprecated Use {@link DecodedFingerprint}. */
export type BiometricCaptureResult = DecodedFingerprint;
/** Fully resolved scanner options after merging user options onto defaults. */
export interface ResolvedScannerOptions {
    vendorId: number;
    productId: number;
    interfaceNumber: number;
    configurationValue: number;
    bulkEndpoint: number;
    requestType: "standard" | "class" | "vendor";
    recipient: "device" | "interface" | "endpoint" | "other";
    request: number;
    controlIndex: number;
    commandWindow: number;
    registerWindow: number;
    initWindow: number;
    initBlock: Uint8Array<ArrayBuffer>;
    setupCommand: number[];
    captureCommand: number[];
    ledBrightnessCommand: number[];
    ledOnCommand: number[];
    ledOffCommand: number[];
    registerWriteTemplate: number[];
    exposureRegisters: Array<[number, number]>;
    warmupCapture: boolean;
    ledHoldMs: number;
    captureTimeoutMs: number;
    expectedFrameBytes: number;
    protocol: "class-command" | "register";
    register: {
        request: number;
        value: number;
        verify: boolean;
        triggerRequest: number;
        triggerValue: number;
        statusRequest: number;
        statusIndex: number;
        statusLength: number;
        cmd01Request: number;
        cmd02Request: number;
        cmd11Request: number;
        ledOnValue: number;
        ledOffValue: number;
        statusPollRequest: number;
        statusPollLength: number;
        calibrateGainRegisters: Array<[number, number]>;
        captureGainRegisters: Array<[number, number]>;
        initRegisters: Array<[number, number]>;
    };
}
//# sourceMappingURL=types.d.ts.map