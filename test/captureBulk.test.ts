import { describe, expect, it } from "vitest";
import {
  SecuGenScanner,
  SECUGEN_HUPX_PRODUCT_ID,
  HUPX_FRAME_BYTES,
  HUPX_WIDTH,
  HUPX_HEIGHT,
  HUPX_TRAILING_BYTES,
  UPXAP_FRAME_BYTES,
  UPXAP_WIDTH,
  UPXAP_HEIGHT,
} from "../src/index.js";
import { fakeUsb, makeFrame } from "./helpers/fakeUsb.js";

/**
 * Regression tests for `captureBulk` frame reading.
 *
 * The HUPx streams the frame continuously and does NOT end it with a short
 * packet, so the reader must request exactly `expectedFrameBytes` and stop once
 * that many bytes are in hand (a short packet / ZLP still terminates early for
 * devices that do use them). Demanding a 1 MiB ceiling instead over-read past
 * the 196,608-byte frame and misaligned the decoded image.
 */
describe("captureBulk — HUPx frame reading", () => {
  it("returns a HUPx-sized frame delivered in one transfer", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    const frame = makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0xa5, HUPX_TRAILING_BYTES);
    device.queueFrame(frame);

    const scanner = new SecuGenScanner(device);
    const out = await scanner.captureBulk();

    expect(out.byteLength).toBe(HUPX_FRAME_BYTES);
    expect(out[0]).toBe(0xa5);
    expect(out[HUPX_FRAME_BYTES - 1]).toBe(0xa5);
    // One short read terminates the frame; no extra transferIn calls.
    expect(device.transferInRequests).toHaveLength(1);
  });

  it("does not hang when the frame is shorter than the expected size", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    // Frame trimmed below the 196,608-byte expectation (e.g. warmup / variant).
    device.queueFrame(new Uint8Array(10_000));
    const scanner = new SecuGenScanner(device);
    const out = await scanner.captureBulk();
    expect(out.byteLength).toBe(10_000);
  });

  it("returns a UPx-AP-sized frame in one transfer", async () => {
    const device = fakeUsb({ productId: 0x2310 });
    device.queueFrame(makeFrame(UPXAP_WIDTH, UPXAP_HEIGHT, 12, 0x5a));
    const scanner = new SecuGenScanner(device);
    const out = await scanner.captureBulk(UPXAP_FRAME_BYTES);
    expect(out.byteLength).toBe(UPXAP_FRAME_BYTES);
    expect(out[UPXAP_FRAME_BYTES - 1]).toBe(0x5a);
  });

  it("stops on a zero-length packet without data (throws — nothing read)", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.setZeroLengthPacket();
    const scanner = new SecuGenScanner(device);
    await expect(scanner.captureBulk()).rejects.toThrow(/no data received/);
  });

  it("returns a frame larger than the hint in one short-packet read", async () => {
    // The reading hint is only used as a ceiling guard — a frame that is
    // actually larger than expectedFrameBytes should still be returned whole
    // (single short-packet-transfer termination, like a real USB bulk IN).
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(new Uint8Array(100_000).fill(3));
    const scanner = new SecuGenScanner(device);
    const out = await scanner.captureBulk(10_000);
    expect(out.byteLength).toBe(100_000);
    expect(out[50_000]).toBe(3);
    // One transferIn call — the short packet ends the transfer.
    expect(device.transferInRequests).toHaveLength(1);
  });
});

describe("captureBulk free function", () => {
  it("captures raw bytes off the device", async () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    device.queueFrame(makeFrame(HUPX_WIDTH, HUPX_HEIGHT, 0, 0x42, HUPX_TRAILING_BYTES));
    const { captureBulk } = await import("../src/index.js");
    const out = await captureBulk(device);
    expect(out.byteLength).toBe(HUPX_FRAME_BYTES);
  });
});