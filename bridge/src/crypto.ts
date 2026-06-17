import { createCipheriv, createDecipheriv } from "node:crypto";

/** Meshtastic well-known default channel key (AES-128). */
export const DEFAULT_KEY = Buffer.from([
  0xd4, 0xf1, 0xbb, 0x3a, 0x20, 0x29, 0x07, 0x59,
  0xf0, 0xbc, 0xff, 0xab, 0xcf, 0x4e, 0x69, 0x01,
]);

/** Expand a Meshtastic PSK into a usable AES key. */
export function expandKey(psk: Buffer): Buffer {
  if (psk.length === 0) return Buffer.alloc(0);
  if (psk.length === 1) {
    // single-byte PSK indexes the default key; 0x01 == default channel
    const key = Buffer.from(DEFAULT_KEY);
    key[key.length - 1] = (DEFAULT_KEY[DEFAULT_KEY.length - 1] + psk[0] - 1) & 0xff;
    return key;
  }
  return Buffer.from(psk); // 16- or 32-byte keys used directly
}

/** CTR nonce = packetId (uint64 LE) ++ fromNode (uint32 LE) ++ 0x00000000. */
export function buildNonce(fromNode: number, packetId: number): Buffer {
  const nonce = Buffer.alloc(16);
  nonce.writeUInt32LE(packetId >>> 0, 0); // low 32 bits of id; bytes 4-7 stay 0
  nonce.writeUInt32LE(fromNode >>> 0, 8);
  return nonce;
}

function algoFor(key: Buffer): "aes-256-ctr" | "aes-128-ctr" {
  return key.length === 32 ? "aes-256-ctr" : "aes-128-ctr";
}

export function decrypt(key: Buffer, fromNode: number, packetId: number, ct: Buffer): Buffer {
  const d = createDecipheriv(algoFor(key), key, buildNonce(fromNode, packetId));
  return Buffer.concat([d.update(ct), d.final()]);
}

export function encrypt(key: Buffer, fromNode: number, packetId: number, pt: Buffer): Buffer {
  const c = createCipheriv(algoFor(key), key, buildNonce(fromNode, packetId));
  return Buffer.concat([c.update(pt), c.final()]);
}
