/**
 * Test double for the W3C WebUSB `USBDevice`. The real driver only uses a
 * small surface (open/close/claim, controlTransferOut, transferIn), so this
 * fake records every control transfer and replays queued bulk-IN frames.
 */

export interface RecordedControlTransfer {
  setup: USBControlTransferSetup;
  data?: Uint8Array;
}

export interface FakeUsbOptions {
  vendorId?: number;
  productId?: number;
  opened?: boolean;
}

export class FakeUsbDevice implements USBDevice {
  vendorId: number;
  productId: number;
  opened: boolean;
  configuration: USBConfiguration | null = null;

  /** Every controlTransferOut call, in order (with its payload). */
  controlTransfers: RecordedControlTransfer[] = [];

  /** Frames to serve from transferIn, in order. */
  private frames: Uint8Array[] = [];

  /** When set, transferIn resolves with a zero-length packet each call. */
  private zeroLength = false;

  /** When set, transferIn resolves with an empty (0-byte) read. */
  private emptyRead = false;

  /** When set, transferIn never resolves (stalled endpoint). */
  private stall = false;

  /** Lengths passed to each transferIn call, in order (for asserting reads). */
  transferInRequests: number[] = [];

  constructor(options: FakeUsbOptions = {}) {
    this.vendorId = options.vendorId ?? 0x1162;
    this.productId = options.productId ?? 0x2201;
    this.opened = options.opened ?? false;
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  async selectConfiguration(): Promise<void> {
    this.configuration = { interfaces: [] };
  }

  async claimInterface(): Promise<void> {}
  async releaseInterface(): Promise<void> {}

  async controlTransferOut(
    setup: USBControlTransferSetup,
    data?: BufferSource,
  ): Promise<{ status: string; bytesWritten: number }> {
    this.controlTransfers.push({
      setup: { ...setup },
      data: data ? new Uint8Array(data as ArrayBuffer) : undefined,
    });
    return { status: "ok", bytesWritten: data ? data.byteLength : 0 };
  }

  async transferIn(
    endpointNumber: number,
    length: number,
  ): Promise<{ data: DataView; status: string }> {
    this.transferInRequests.push(length);
    if (this.stall) {
      return new Promise(() => {});
    }
    if (this.frames.length > 0) {
      const frame = this.frames.shift()!;
      const out = new Uint8Array(frame.byteLength);
      out.set(frame);
      return { data: new DataView(out.buffer), status: "ok" };
    }
    if (this.zeroLength || this.emptyRead) {
      return { data: new DataView(new ArrayBuffer(0)), status: "ok" };
    }
    return { data: new DataView(new ArrayBuffer(0)), status: "ok" };
  }

  /** Queue a bulk-IN frame the next transferIn call will return. */
  queueFrame(bytes: Uint8Array): this {
    this.frames.push(bytes);
    return this;
  }

  /** Make every transferIn resolve as a zero-length packet. */
  setZeroLengthPacket(): this {
    this.zeroLength = true;
    return this;
  }

  /** Make every transferIn resolve with a 0-byte read (no packet). */
  setEmptyRead(): this {
    this.emptyRead = true;
    return this;
  }

  /** Make every transferIn hang (device never responds). */
  setStalled(): this {
    this.stall = true;
    return this;
  }
}

/** Convenience factory for a fake device. */
export const fakeUsb = (options?: FakeUsbOptions): FakeUsbDevice =>
  new FakeUsbDevice(options);

/** Builds a synthetic raw frame: header + width×height bytes, all = fill. */
export const makeFrame = (
  width: number,
  height: number,
  headerBytes = 12,
  fill = 0xa5,
): Uint8Array => {
  const bytes = new Uint8Array(headerBytes + width * height);
  bytes.fill(fill, headerBytes);
  return bytes;
};