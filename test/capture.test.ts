import { describe, expect, it } from "vitest";
import {
  SecuGenScanner,
  SECUGEN_HUPX_PRODUCT_ID,
  SECUGEN_UPXAP_PRODUCT_ID,
  HUPX_FRAME_BYTES,
  HUPX_WIDTH,
  HUPX_HEIGHT,
  HUPX_TRAILING_BYTES,
  HUPX_REGISTER_REQUEST,
  HUPX_REGISTER_VALUE,
  HUPX_TRIGGER_REQUEST,
  HUPX_TRIGGER_VALUE,
  HUPX_STATUS_REQUEST,
  HUPX_STATUS_INDEX,
  HUPX_STATUS_LENGTH,
  HUPX_CMD01_REQUEST,
  HUPX_CMD02_REQUEST,
  HUPX_CMD11_REQUEST,
  HUPX_LED_ON_VALUE,
  HUPX_LED_OFF_VALUE,
  HUPX_STATUS_POLL_REQUEST,
  HUPX_STATUS_POLL_LENGTH,
  HUPX_INIT_REGISTERS,
  HUPX_EXPOSURE_REGISTERS,
  HUPX_CALIBRATE_GAIN_REGISTERS,
  HUPX_CAPTURE_GAIN_REGISTERS,
  DEFAULT_EXPOSURE_REGISTERS,
} from "../src/index.js";
import { fakeUsb, makeFrame } from "./helpers/fakeUsb.js";

/** Returns every control transfer sent with the register envelope. */
const regTransfers = (device: ReturnType<typeof fakeUsb>) =>
  device.controlTransfers.filter((t) => t.setup.request === HUPX_REGISTER_REQUEST);

/** Returns every register write (OUT, with data), in order. */
const regWrites = (device: ReturnType<typeof fakeUsb>) =>
  regTransfers(device).filter(
    (t) => !t.read && t.setup.value === HUPX_REGISTER_VALUE && t.data,
  );

/** Returns every register read-back (IN, no data), in order. */
const regReads = (device: ReturnType<typeof fakeUsb>) =>
  regTransfers(device).filter((t) => t.read);

/** Returns control transfers for a given bRequest, in order. */
const requests = (
  device: ReturnType<typeof fakeUsb>,
  request: number,
) => device.controlTransfers.filter((t) => t.setup.request === request);

describe("SecuGenScanner.capture — HUPx register protocol", () => {
  it("runs the two-pass flow: init + calibrate (discarded) + real capture with LED", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0x11, HUPX_TRAILING_BYTES));
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0x22, HUPX_TRAILING_BYTES));

    const scanner = new SecuGenScanner(device, { ledHoldMs: 0 });
    const frame = await scanner.capture();

    // 1. Returned frame is the raw 552×356 + 96 trailing bytes (the real
    //    pass's frame — the calibrate frame was discarded).
    expect(frame.byteLength).toBe(HUPX_FRAME_BYTES);
    expect(frame[HUPX_FRAME_BYTES - 1]).toBe(0x22);

    // 2. Two bulk reads: the discarded calibrate frame then the real frame.
    expect(device.transferInRequests).toHaveLength(2);
    expect(device.transferInRequests[0]).toBe(HUPX_FRAME_BYTES);
    expect(device.transferInRequests[1]).toBe(HUPX_FRAME_BYTES);

    // 3. Register writes, in order: init → calibrate gain → exposure →
    //    capture gain → capture gain (again, after LED on).
    const writes = regWrites(device);
    expect(writes).toHaveLength(
      HUPX_INIT_REGISTERS.length +
        HUPX_CALIBRATE_GAIN_REGISTERS.length +
        HUPX_EXPOSURE_REGISTERS.length +
        HUPX_CAPTURE_GAIN_REGISTERS.length * 2,
    );
    const initEnd = HUPX_INIT_REGISTERS.length;
    HUPX_INIT_REGISTERS.forEach(([reg, val], i) => {
      expect(writes[i].setup.index).toBe(reg);
      expect(writes[i].data?.[0]).toBe(val);
    });
    HUPX_CALIBRATE_GAIN_REGISTERS.forEach(([reg, val], i) => {
      expect(writes[initEnd + i].setup.index).toBe(reg);
      expect(writes[initEnd + i].data?.[0]).toBe(val);
    });
    const expStart = initEnd + HUPX_CALIBRATE_GAIN_REGISTERS.length;
    HUPX_EXPOSURE_REGISTERS.forEach(([reg, val], i) => {
      expect(writes[expStart + i].setup.index).toBe(reg);
      expect(writes[expStart + i].data?.[0]).toBe(val);
    });
    const gainStart = expStart + HUPX_EXPOSURE_REGISTERS.length;
    HUPX_CAPTURE_GAIN_REGISTERS.forEach(([reg, val], i) => {
      expect(writes[gainStart + i].setup.index).toBe(reg);
      expect(writes[gainStart + i].data?.[0]).toBe(val);
    });
    const gainStart2 = gainStart + HUPX_CAPTURE_GAIN_REGISTERS.length;
    HUPX_CAPTURE_GAIN_REGISTERS.forEach(([reg, val], i) => {
      expect(writes[gainStart2 + i].setup.index).toBe(reg);
      expect(writes[gainStart2 + i].data?.[0]).toBe(val);
    });

    // 4. TRIG happens four times: pass 1 ×2 (calibrate), pass 2 ×2 (real).
    const trigs = requests(device, HUPX_TRIGGER_REQUEST);
    expect(trigs).toHaveLength(4);
    trigs.forEach((t) => expect(t.setup.value).toBe(HUPX_TRIGGER_VALUE));

    // 5. Pass-1 status poll (bReq 8, wIdx 0x2000).
    const status = requests(device, HUPX_STATUS_REQUEST);
    expect(status.length).toBeGreaterThanOrEqual(1);
    expect(status[0].setup.index).toBe(HUPX_STATUS_INDEX);
    expect(status[0].setup.value).toBe(0);

    // 6. Image-ready status polls (bReq 0x16, len 4): 2 before the LED on,
    //    1 after cmd02 = 3 total.
    const polls = requests(device, HUPX_STATUS_POLL_REQUEST);
    expect(polls).toHaveLength(3);
    polls.forEach((p) => expect(p.setup.value).toBe(0));

    // 7. LED gate: cmd11 on → … → cmd11 off, with on/off wValues.
    const led = requests(device, HUPX_CMD11_REQUEST);
    expect(led).toHaveLength(2);
    expect(led[0].setup.value).toBe(HUPX_LED_ON_VALUE);
    expect(led[1].setup.value).toBe(HUPX_LED_OFF_VALUE);

    // 8. cmd01 opens the readout gate, cmd02 closes it — twice each (once per
    //    pass), with the bulk reads between.
    const cmd01 = requests(device, HUPX_CMD01_REQUEST);
    const cmd02 = requests(device, HUPX_CMD02_REQUEST);
    expect(cmd01).toHaveLength(2);
    expect(cmd02).toHaveLength(2);
    const all = device.controlTransfers;
    const trigIdx = all.indexOf(trigs[0]);
    const cmd01Idx = all.indexOf(cmd01[0]);
    const cmd02Idx = all.indexOf(cmd02[0]);
    expect(trigIdx).toBeLessThan(cmd01Idx);
    expect(cmd01Idx).toBeLessThan(cmd02Idx);
    // LED on comes between pass-1 cmd02 and pass-2 cmd01.
    const ledOnIdx = all.indexOf(led[0]);
    const cmd01P2Idx = all.indexOf(cmd01[1]);
    expect(cmd02Idx).toBeLessThan(ledOnIdx);
    expect(ledOnIdx).toBeLessThan(cmd01P2Idx);
  });

  it("discards the calibrate frame and returns the real pass's frame (no warmup)", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0x11, HUPX_TRAILING_BYTES));
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0x33, HUPX_TRAILING_BYTES));
    const scanner = new SecuGenScanner(device, {
      ledHoldMs: 0,
      warmupCapture: false,
    });
    const frame = await scanner.capture();
    expect(frame.byteLength).toBe(HUPX_FRAME_BYTES);
    expect(frame[HUPX_FRAME_BYTES - 1]).toBe(0x33);
    expect(device.transferInRequests).toHaveLength(2);
  });

  it("rejects with a timeout message when the device never responds", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.setStalled();
    const scanner = new SecuGenScanner(device, {
      ledHoldMs: 0,
      warmupCapture: false,
      captureTimeoutMs: 30,
    });
    await expect(scanner.capture()).rejects.toThrow(/timed out/i);
  }, 10_000);

  it("skips read-back verification when register.verify is disabled", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0x11, HUPX_TRAILING_BYTES));
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0x22, HUPX_TRAILING_BYTES));
    const scanner = new SecuGenScanner(device, {
      ledHoldMs: 0,
      register: { verify: false },
    });
    await scanner.capture();
    expect(regReads(device)).toHaveLength(0);
  });
});

describe("SecuGenScanner.capture — UPx-AP class-command", () => {
  it("runs the class-command flow and auto-detects the product", async () => {
    const device = fakeUsb({ productId: SECUGEN_UPXAP_PRODUCT_ID });
    device.queueFrame(new Uint8Array(12)); // warmup (short, tolerated)
    device.queueFrame(new Uint8Array(12)); // real (short, tolerated)
    const scanner = new SecuGenScanner(device, { ledHoldMs: 0 });
    expect(scanner.productInfo.name).toBe("UPx-AP");
    const frame = await scanner.capture();
    expect(frame.byteLength).toBe(12);
    // No register-envelope transfers on the class-command flow.
    expect(regTransfers(device)).toHaveLength(0);
    // Exposure registers written via the class-command template.
    const regs = device.controlTransfers.filter(
      (t) => t.setup.value === 0x0700,
    );
    expect(regs).toHaveLength(DEFAULT_EXPOSURE_REGISTERS.length);
  });
});

describe("SecuGenScanner.scan", () => {
  it("decodes a HUPx frame to the product's image geometry", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    const pixels = new Uint8Array(HUPX_WIDTH * HUPX_HEIGHT).fill(0x7f);
    const frame = new Uint8Array(HUPX_FRAME_BYTES);
    frame.set(pixels);
    device.queueFrame(new Uint8Array(HUPX_FRAME_BYTES)); // calibrate (discarded)
    device.queueFrame(frame); // real
    const scanner = new SecuGenScanner(device, { ledHoldMs: 0 });
    const image = await scanner.scan();
    expect(image.width).toBe(HUPX_WIDTH);
    expect(image.height).toBe(HUPX_HEIGHT);
    expect(image.byteLength).toBe(HUPX_WIDTH * HUPX_HEIGHT);
    expect(image.raw).toBeInstanceOf(Uint8Array);
  });
});