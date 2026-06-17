import { describe, it, expect } from "vitest";
import { expandKey, encrypt, decrypt, DEFAULT_KEY } from "../src/crypto.js";

describe("expandKey", () => {
  it("expands single-byte default psk (0x01) to the default key", () => {
    expect(expandKey(Buffer.from([0x01]))).toEqual(DEFAULT_KEY);
  });
  it("passes a 16-byte key through unchanged", () => {
    const k = Buffer.alloc(16, 7);
    expect(expandKey(k)).toEqual(k);
  });
});

describe("AES-CTR round trip", () => {
  it("decrypt reverses encrypt with same key/nonce", () => {
    const key = expandKey(Buffer.from([0x01]));
    const from = 0x12345678;
    const id = 0x00abcdef;
    const plain = Buffer.from("hello mesh", "utf8");
    const ct = encrypt(key, from, id, plain);
    expect(ct.equals(plain)).toBe(false);
    expect(decrypt(key, from, id, ct).toString("utf8")).toBe("hello mesh");
  });
});
