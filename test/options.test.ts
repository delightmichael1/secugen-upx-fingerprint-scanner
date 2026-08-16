import { describe, expect, it } from "vitest";
import {
  resolveScannerOptions,
  resolveScannerOptionsForDevice,
  detectProduct,
  SECUGEN_HUPX_PRODUCT_ID,
  SECUGEN_UPXAP_PRODUCT_ID,
  SECUGEN_VENDOR_ID,
} from "../src/index.js";
import { fakeUsb } from "./helpers/fakeUsb.js";

describe("resolveScannerOptions", () => {
  it("applies product-appropriate frame bytes when productId is set", () => {
    const hupx = resolveScannerOptions({ productId: SECUGEN_HUPX_PRODUCT_ID });
    expect(hupx.expectedFrameBytes).toBe(78_012);

    const upxAp = resolveScannerOptions({ productId: SECUGEN_UPXAP_PRODUCT_ID });
    expect(upxAp.expectedFrameBytes).toBe(1_400_012);
  });

  it("defaults to UPx-AP frame bytes with no product id", () => {
    expect(resolveScannerOptions({}).expectedFrameBytes).toBe(1_400_012);
  });

  it("honours an explicit expectedFrameBytes override", () => {
    const opts = resolveScannerOptions({
      productId: SECUGEN_HUPX_PRODUCT_ID,
      expectedFrameBytes: 1234,
    });
    expect(opts.expectedFrameBytes).toBe(1234);
  });

  it("keeps the reverse-engineered transfer windows unchanged", () => {
    const opts = resolveScannerOptions({ productId: SECUGEN_HUPX_PRODUCT_ID });
    expect(opts.commandWindow).toBe(0x0600);
    expect(opts.registerWindow).toBe(0x0700);
    expect(opts.initWindow).toBe(0x1800);
    expect(opts.bulkEndpoint).toBe(2);
    expect(opts.vendorId).toBe(SECUGEN_VENDOR_ID);
  });
});

describe("resolveScannerOptionsForDevice", () => {
  it("detects HUPx geometry from the device product id", () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    const resolved = resolveScannerOptionsForDevice(device);
    expect(resolved.product.name).toBe("HUPx");
    expect(resolved.scan.expectedFrameBytes).toBe(78_012);
    expect(resolved.decode.width).toBe(260);
    expect(resolved.decode.height).toBe(300);
    expect(resolved.decode.headerBytes).toBe(12);
  });

  it("detects UPx-AP geometry from the device product id", () => {
    const device = fakeUsb({ productId: SECUGEN_UPXAP_PRODUCT_ID });
    const resolved = resolveScannerOptionsForDevice(device);
    expect(resolved.product.name).toBe("UPx-AP");
    expect(resolved.scan.expectedFrameBytes).toBe(1_400_012);
    expect(resolved.decode.width).toBe(1400);
    expect(resolved.decode.height).toBe(1000);
  });
});

describe("detectProduct", () => {
  it("maps a HUPx device to the HUPx profile", () => {
    const device = fakeUsb({ productId: SECUGEN_HUPX_PRODUCT_ID });
    expect(detectProduct(device).name).toBe("HUPx");
  });

  it("maps a UPx-AP device to the UPx-AP profile", () => {
    const device = fakeUsb({ productId: SECUGEN_UPXAP_PRODUCT_ID });
    expect(detectProduct(device).name).toBe("UPx-AP");
  });
});