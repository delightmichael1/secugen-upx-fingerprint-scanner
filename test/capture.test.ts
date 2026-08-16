import { describe, expect, it } from "vitest";
import {
  SecuGenScanner,
  SECUGEN_HUPX_PRODUCT_ID,
  SECUGEN_UPXAP_PRODUCT_ID,
  DEFAULT_EXPOSURE_REGISTERS,
  HUPX_FRAME_BYTES,
  HUPX_WIDTH,
  HUPX_HEIGHT,
} from "../src/index.js";
import { fakeUsb, makeFrame } from "./helpers/fakeUsb.js";

/** Returns every control transfer sent on a given window. */
const transfersOn = (device: ReturnType<typeof fakeUsb>, window: number) =>
  device.controlTransfers.filter((t) => t.setup.value === window);

describe("SecuGenScanner.capture — full sequence", () => {
  it("runs init → setup → registers → warmup → LED → capture → LED off", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 0x11)); // warmup
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 0x22)); // real

    const scanner = new SecuGenScanner(device, { ledHoldMs: 0 });
    const frame = await scanner.capture();

    // 1. The returned frame is the *second* (real) capture.
    expect(frame.byteLength).toBe(HUPX_FRAME_BYTES);
    expect(frame[HUPX_FRAME_BYTES - 1]).toBe(0x22);

    // 2. Init block on the init window.
    const init = transfersOn(device, 0x1800);
    expect(init).toHaveLength(1);
    expect(init[0].data?.byteLength).toBe(516);

    // 3. Streaming setup + capture + LED commands on the command window.
    const cmd = transfersOn(device, 0x0600);
    const cmdPayloads = cmd.map((c) => Array.from(c.data ?? []));
    // Setup (0x78 0x04), LED brightness (0x8f), LED on (0x8e 0x01),
    // capture x2 (0x78 0x03), LED off (0x8e 0x00).
    expect(cmdPayloads.length).toBeGreaterThanOrEqual(5);
    expect(cmdPayloads[0]).toEqual([0x81, 0x0b, 0x78, 0x04, 0, 0, 0, 0, 0x10, 0x01, 0]);
    expect(cmdPayloads.at(-1)?.[2]).toBe(0x8e); // LED off last
    expect(cmdPayloads.at(-1)?.[3]).toBe(0x00);

    // 4. Exposure / gain registers exactly once each on the register window.
    const regs = transfersOn(device, 0x0700);
    expect(regs).toHaveLength(DEFAULT_EXPOSURE_REGISTERS.length);
    DEFAULT_EXPOSURE_REGISTERS.forEach(([reg, val], i) => {
      const payload = Array.from(regs[i].data ?? []);
      expect(payload[2]).toBe(reg);
      expect(payload[3]).toBe(val);
    });

    // 5. Two bulk reads: warmup drain + real capture.
    expect(device.transferInRequests.length).toBeGreaterThanOrEqual(2);
  });

  it("captures without a warmup pass when warmupCapture is disabled", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 0x33));
    const scanner = new SecuGenScanner(device, {
      ledHoldMs: 0,
      warmupCapture: false,
    });
    const frame = await scanner.capture();
    expect(frame.byteLength).toBe(HUPX_FRAME_BYTES);
    expect(device.transferInRequests).toHaveLength(1);
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

  it("auto-detects the product and applies its geometry (UPx-AP)", async () => {
    const device = fakeUsb({ productId: SECUGEN_UPXAP_PRODUCT_ID });
    device.queueFrame(new Uint8Array(12)); // warmup (short, tolerated)
    device.queueFrame(new Uint8Array(12)); // real (short, tolerated)
    const scanner = new SecuGenScanner(device, { ledHoldMs: 0 });
    expect(scanner.productInfo.name).toBe("UPx-AP");
    const frame = await scanner.capture();
    expect(frame.byteLength).toBe(12);
  });
});

describe("SecuGenScanner.scan", () => {
  it("decodes a HUPx frame to the product's image geometry", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 0x7f));
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 12, 0x7f));
    const scanner = new SecuGenScanner(device, { ledHoldMs: 0 });
    const image = await scanner.scan();
    expect(image.width).toBe(HUPX_WIDTH);
    expect(image.height).toBe(HUPX_HEIGHT);
    expect(image.byteLength).toBe(HUPX_WIDTH * HUPX_HEIGHT);
    expect(image.raw).toBeInstanceOf(Uint8Array);
  });
});