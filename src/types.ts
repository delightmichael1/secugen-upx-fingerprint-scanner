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
    controlTransferIn(
      setup: USBControlTransferSetup,
      length: number,
    ): Promise<{ data: DataView }>;
    controlTransferOut(
      setup: USBControlTransferSetup,
      data?: BufferSource,
    ): Promise<{ status: string; bytesWritten: number }>;
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
        filters: Array<{ vendorId: number; productId?: number }>;
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
 * A supported SecuGen product in the UPx family. Each product differs only in
 * sensor geometry (frame bytes, image dimensions) — protocol commands and
 * tuning are shared across the family.
 */
export interface SecuGenProduct {
  /** USB product id (`USBDevice.productId`). */
  productId: number;
  /** Short product name, e.g. "HUPx" or "UPx-AP". */
  name: string;
  /** Bytes at the front of the raw frame before the pixel matrix. */
  headerBytes: number;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Total expected raw frame size in bytes (header + width × height). */
  frameBytes: number;
}

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
}

/**
 * Decoder options. These control how a raw frame is turned into an 8-bit
 * grayscale image: quincunx placement, interpolation, polarity, orientation
 * and the adaptive contrast/gamma pass.
 */
export interface DecodeOptions {
  /** Bytes to strip from the front of the frame (default 12). */
  headerBytes?: number;
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
  /** Rotation to apply after decode (default 180 — sensor reads bottom-up). */
  rotate?: 0 | 180;
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
}
