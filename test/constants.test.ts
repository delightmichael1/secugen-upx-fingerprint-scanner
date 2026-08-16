import { describe, expect, it } from "vitest";
import {
  SECUGEN_HUPX_PRODUCT_ID,
  SECUGEN_PRODUCT_ID,
  SECUGEN_UPXAP_PRODUCT_ID,
  HUPX_HEADER_BYTES,
  HUPX_WIDTH,
  HUPX_HEIGHT,
  HUPX_FRAME_BYTES,
  UPXAP_HEADER_BYTES,
  UPXAP_WIDTH,
  UPXAP_HEIGHT,
  UPXAP_FRAME_BYTES,
  getScannerProduct,
  SCANNER_PRODUCTS,
} from "../src/index.js";

describe("product registry", () => {
  it("registers both HUPx and UPx-AP profiles", () => {
    expect(SCANNER_PRODUCTS).toHaveLength(2);
    expect(SCANNER_PRODUCTS.map((p) => p.productId)).toContain(
      SECUGEN_HUPX_PRODUCT_ID,
    );
    expect(SCANNER_PRODUCTS.map((p) => p.productId)).toContain(
      SECUGEN_UPXAP_PRODUCT_ID,
    );
  });

  it("looks up the HUPx profile by its product id", () => {
    const product = getScannerProduct(SECUGEN_HUPX_PRODUCT_ID);
    expect(product.name).toBe("HUPx");
    expect(product.headerBytes).toBe(HUPX_HEADER_BYTES);
    expect(product.width).toBe(HUPX_WIDTH);
    expect(product.height).toBe(HUPX_HEIGHT);
    expect(product.frameBytes).toBe(HUPX_FRAME_BYTES);
    expect(product.frameBytes).toBe(HUPX_HEADER_BYTES + HUPX_WIDTH * HUPX_HEIGHT);
  });

  it("looks up the UPx-AP profile by its product id", () => {
    const product = getScannerProduct(SECUGEN_UPXAP_PRODUCT_ID);
    expect(product.name).toBe("UPx-AP");
    expect(product.headerBytes).toBe(UPXAP_HEADER_BYTES);
    expect(product.width).toBe(UPXAP_WIDTH);
    expect(product.height).toBe(UPXAP_HEIGHT);
    expect(product.frameBytes).toBe(UPXAP_FRAME_BYTES);
  });

  it("falls back to the UPx-AP profile for unknown product ids", () => {
    expect(getScannerProduct(0x9999).productId).toBe(SECUGEN_UPXAP_PRODUCT_ID);
    expect(getScannerProduct(undefined).productId).toBe(SECUGEN_PRODUCT_ID);
  });

  it("HUPx geometry is 260×300, UPx-AP is 1400×1000", () => {
    expect([HUPX_WIDTH, HUPX_HEIGHT]).toEqual([260, 300]);
    expect([UPXAP_WIDTH, UPXAP_HEIGHT]).toEqual([1400, 1000]);
    expect(HUPX_FRAME_BYTES).toBe(78_012);
    expect(UPXAP_FRAME_BYTES).toBe(1_400_012);
  });
});