/**
 * QQ Music QRC lyric decryption.
 *
 * The QQ Music lyric API returns an encrypted QRC payload. The payload is a
 * hex string whose bytes are Triple-DES (EDE3) ciphertext (fixed key, one
 * 8-byte block at a time), and the decrypted concatenation is a zlib stream
 * whose inflation yields the UTF-8 lyric text (LRC/QRC).
 *
 * The 3DES here is a NON-STANDARD variant: QQ uses a DES key schedule whose
 * PC-2 compression permutation deviates from FIPS 46-3, so Node's built-in
 * `des-ede3` cannot decrypt it (verified empirically — standard `des-ede3`
 * produces garbage). This module implements the variant directly.
 *
 * The DES structure (S-boxes, initial/inverse permutations, E/P expansions,
 * Feistel network, PC-1 key permutation, shift schedule) follows the public
 * DES standard (FIPS PUB 46-3). The QQ-specific PC-2 variant table and the
 * fixed 24-byte key are protocol facts documented in public QQ Music decoder
 * references (WXRIW/QQMusicDecoder, L-1124/QQMusicApi). This is an independent
 * TypeScript implementation, not a port of any project's source text.
 *
 * Index accesses are guarded with `!`: every index is bound by construction
 * (block/round/S-box sizes are fixed by the algorithm), so `undefined` is
 * impossible at runtime.
 */
import { inflateSync } from "node:zlib";

const ENCRYPT = 1;
const DECRYPT = 0;

/** Fixed QRC Triple-DES key (24 bytes). */
const QRC_KEY = Buffer.from("!@#)(*$%123ZXC!@!@#)(NHL", "latin1");

// Standard DES S-boxes (FIPS 46-3): 8 boxes × 64 entries.
const SBOX: readonly (readonly number[])[] = [
  [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
  [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
  [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
  [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
  [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
  [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
  [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
  [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11],
];

// Per-round left-rotation amounts applied to the C/D key halves (standard DES).
const KEY_RND_SHIFT = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

// PC-1 key permutation: C half (indices into the 64-bit key, 0-based).
const KEY_PERM_C = [56, 48, 40, 32, 24, 16, 8, 0, 57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35];
// PC-1 key permutation: D half.
const KEY_PERM_D = [62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 60, 52, 44, 36, 28, 20, 12, 4, 27, 19, 11, 3];

// PC-2 compression permutation (QQ NON-STANDARD variant). Indices into the
// 56-bit C/D halves (first 24 reference C, last 24 reference D offset by 27).
const KEY_COMPRESSION = [13, 16, 10, 23, 0, 4, 2, 27, 14, 5, 20, 9, 22, 18, 11, 3, 25, 7, 15, 6, 26, 19, 12, 1, 40, 51, 30, 36, 46, 54, 29, 39, 50, 44, 32, 47, 43, 48, 38, 55, 33, 52, 45, 41, 49, 35, 28, 31];

/** Recombine 6 bits into the row/column index used to look up an S-box. */
function sboxBit(a: number): number {
  return (a & 32) | ((a & 31) >>> 1) | ((a & 1) << 4);
}

/** Look up S-box `box` at `index` (both fixed-range by construction). */
function sboxLookup(box: number, index: number): number {
  return SBOX[box]![index]!;
}

/** Initial permutation: 8-byte block → (left32, right32) as unsigned ints. */
function initialPermutation(input: Uint8Array): [number, number] {
  const v0 = (input[0]! | (input[1]! << 8) | (input[2]! << 16) | (input[3]! << 24)) >>> 0;
  const v1 = (input[4]! | (input[5]! << 8) | (input[6]! << 16) | (input[7]! << 24)) >>> 0;

  const s0 = (
    (((v1 >>> 6) & 1) << 31)
    | (((v1 >>> 14) & 1) << 30)
    | (((v1 >>> 22) & 1) << 29)
    | (((v1 >>> 30) & 1) << 28)
    | (((v0 >>> 6) & 1) << 27)
    | (((v0 >>> 14) & 1) << 26)
    | (((v0 >>> 22) & 1) << 25)
    | (((v0 >>> 30) & 1) << 24)
    | (((v1 >>> 4) & 1) << 23)
    | (((v1 >>> 12) & 1) << 22)
    | (((v1 >>> 20) & 1) << 21)
    | (((v1 >>> 28) & 1) << 20)
    | (((v0 >>> 4) & 1) << 19)
    | (((v0 >>> 12) & 1) << 18)
    | (((v0 >>> 20) & 1) << 17)
    | (((v0 >>> 28) & 1) << 16)
    | (((v1 >>> 2) & 1) << 15)
    | (((v1 >>> 10) & 1) << 14)
    | (((v1 >>> 18) & 1) << 13)
    | (((v1 >>> 26) & 1) << 12)
    | (((v0 >>> 2) & 1) << 11)
    | (((v0 >>> 10) & 1) << 10)
    | (((v0 >>> 18) & 1) << 9)
    | (((v0 >>> 26) & 1) << 8)
    | (((v1 >>> 0) & 1) << 7)
    | (((v1 >>> 8) & 1) << 6)
    | (((v1 >>> 16) & 1) << 5)
    | (((v1 >>> 24) & 1) << 4)
    | (((v0 >>> 0) & 1) << 3)
    | (((v0 >>> 8) & 1) << 2)
    | (((v0 >>> 16) & 1) << 1)
    | ((v0 >>> 24) & 1)
  ) >>> 0;

  const s1 = (
    (((v1 >>> 7) & 1) << 31)
    | (((v1 >>> 15) & 1) << 30)
    | (((v1 >>> 23) & 1) << 29)
    | (((v1 >>> 31) & 1) << 28)
    | (((v0 >>> 7) & 1) << 27)
    | (((v0 >>> 15) & 1) << 26)
    | (((v0 >>> 23) & 1) << 25)
    | (((v0 >>> 31) & 1) << 24)
    | (((v1 >>> 5) & 1) << 23)
    | (((v1 >>> 13) & 1) << 22)
    | (((v1 >>> 21) & 1) << 21)
    | (((v1 >>> 29) & 1) << 20)
    | (((v0 >>> 5) & 1) << 19)
    | (((v0 >>> 13) & 1) << 18)
    | (((v0 >>> 21) & 1) << 17)
    | (((v0 >>> 29) & 1) << 16)
    | (((v1 >>> 3) & 1) << 15)
    | (((v1 >>> 11) & 1) << 14)
    | (((v1 >>> 19) & 1) << 13)
    | (((v1 >>> 27) & 1) << 12)
    | (((v0 >>> 3) & 1) << 11)
    | (((v0 >>> 11) & 1) << 10)
    | (((v0 >>> 19) & 1) << 9)
    | (((v0 >>> 27) & 1) << 8)
    | (((v1 >>> 1) & 1) << 7)
    | (((v1 >>> 9) & 1) << 6)
    | (((v1 >>> 17) & 1) << 5)
    | (((v1 >>> 25) & 1) << 4)
    | (((v0 >>> 1) & 1) << 3)
    | (((v0 >>> 9) & 1) << 2)
    | (((v0 >>> 17) & 1) << 1)
    | ((v0 >>> 25) & 1)
  ) >>> 0;

  return [s0, s1];
}

/** Inverse initial permutation: (left32, right32) → 8-byte block. */
function inversePermutation(s0: number, s1: number): Uint8Array {
  const data = new Uint8Array(8);
  data[3] = (
    (((s1 >>> 24) & 1) << 7)
    | (((s0 >>> 24) & 1) << 6)
    | (((s1 >>> 16) & 1) << 5)
    | (((s0 >>> 16) & 1) << 4)
    | (((s1 >>> 8) & 1) << 3)
    | (((s0 >>> 8) & 1) << 2)
    | (((s1 >>> 0) & 1) << 1)
    | ((s0 >>> 0) & 1)
  );
  data[2] = (
    (((s1 >>> 25) & 1) << 7)
    | (((s0 >>> 25) & 1) << 6)
    | (((s1 >>> 17) & 1) << 5)
    | (((s0 >>> 17) & 1) << 4)
    | (((s1 >>> 9) & 1) << 3)
    | (((s0 >>> 9) & 1) << 2)
    | (((s1 >>> 1) & 1) << 1)
    | ((s0 >>> 1) & 1)
  );
  data[1] = (
    (((s1 >>> 26) & 1) << 7)
    | (((s0 >>> 26) & 1) << 6)
    | (((s1 >>> 18) & 1) << 5)
    | (((s0 >>> 18) & 1) << 4)
    | (((s1 >>> 10) & 1) << 3)
    | (((s0 >>> 10) & 1) << 2)
    | (((s1 >>> 2) & 1) << 1)
    | ((s0 >>> 2) & 1)
  );
  data[0] = (
    (((s1 >>> 27) & 1) << 7)
    | (((s0 >>> 27) & 1) << 6)
    | (((s1 >>> 19) & 1) << 5)
    | (((s0 >>> 19) & 1) << 4)
    | (((s1 >>> 11) & 1) << 3)
    | (((s0 >>> 11) & 1) << 2)
    | (((s1 >>> 3) & 1) << 1)
    | ((s0 >>> 3) & 1)
  );
  data[7] = (
    (((s1 >>> 28) & 1) << 7)
    | (((s0 >>> 28) & 1) << 6)
    | (((s1 >>> 20) & 1) << 5)
    | (((s0 >>> 20) & 1) << 4)
    | (((s1 >>> 12) & 1) << 3)
    | (((s0 >>> 12) & 1) << 2)
    | (((s1 >>> 4) & 1) << 1)
    | ((s0 >>> 4) & 1)
  );
  data[6] = (
    (((s1 >>> 29) & 1) << 7)
    | (((s0 >>> 29) & 1) << 6)
    | (((s1 >>> 21) & 1) << 5)
    | (((s0 >>> 21) & 1) << 4)
    | (((s1 >>> 13) & 1) << 3)
    | (((s0 >>> 13) & 1) << 2)
    | (((s1 >>> 5) & 1) << 1)
    | ((s0 >>> 5) & 1)
  );
  data[5] = (
    (((s1 >>> 30) & 1) << 7)
    | (((s0 >>> 30) & 1) << 6)
    | (((s1 >>> 22) & 1) << 5)
    | (((s0 >>> 22) & 1) << 4)
    | (((s1 >>> 14) & 1) << 3)
    | (((s0 >>> 14) & 1) << 2)
    | (((s1 >>> 6) & 1) << 1)
    | ((s0 >>> 6) & 1)
  );
  data[4] = (
    (((s1 >>> 31) & 1) << 7)
    | (((s0 >>> 31) & 1) << 6)
    | (((s1 >>> 23) & 1) << 5)
    | (((s0 >>> 23) & 1) << 4)
    | (((s1 >>> 15) & 1) << 3)
    | (((s0 >>> 15) & 1) << 2)
    | (((s1 >>> 7) & 1) << 1)
    | ((s0 >>> 7) & 1)
  );
  return data;
}

/** DES F function: expansion + key mixing + S-box substitution + P permutation. */
function f(state: number, key: readonly number[]): number {
  const t1 = (
    (((state & 1) << 31))
    | ((state & 0xF8000000) >>> 1)
    | ((state & 0x1F800000) >>> 3)
    | ((state & 0x01F80000) >>> 5)
    | ((state & 0x001F8000) >>> 7)
  ) >>> 0;
  const t2 = (
    ((state & 0x0001F800) << 15)
    | ((state & 0x00001F80) << 13)
    | ((state & 0x000001F8) << 11)
    | ((state & 0x0000001F) << 9)
    | ((state & 0x80000000) >>> 23)
  ) >>> 0;

  const k0 = ((t1 >>> 24) & 0xFF) ^ key[0]!;
  const k1 = ((t1 >>> 16) & 0xFF) ^ key[1]!;
  const k2 = ((t1 >>> 8) & 0xFF) ^ key[2]!;
  const k3 = ((t2 >>> 24) & 0xFF) ^ key[3]!;
  const k4 = ((t2 >>> 16) & 0xFF) ^ key[4]!;
  const k5 = ((t2 >>> 8) & 0xFF) ^ key[5]!;

  const sub = (
    (sboxLookup(0, sboxBit(k0 >>> 2)) << 28)
    | (sboxLookup(1, sboxBit(((k0 & 0x03) << 4) | (k1 >>> 4))) << 24)
    | (sboxLookup(2, sboxBit(((k1 & 0x0F) << 2) | (k2 >>> 6))) << 20)
    | (sboxLookup(3, sboxBit(k2 & 0x3F)) << 16)
    | (sboxLookup(4, sboxBit(k3 >>> 2)) << 12)
    | (sboxLookup(5, sboxBit(((k3 & 0x03) << 4) | (k4 >>> 4))) << 8)
    | (sboxLookup(6, sboxBit(((k4 & 0x0F) << 2) | (k5 >>> 6))) << 4)
    | sboxLookup(7, sboxBit(k5 & 0x3F))
  ) >>> 0;

  return (
    (((sub >>> 16) & 1) << 31)
    | (((sub >>> 25) & 1) << 30)
    | (((sub >>> 12) & 1) << 29)
    | (((sub >>> 11) & 1) << 28)
    | (((sub >>> 3) & 1) << 27)
    | (((sub >>> 20) & 1) << 26)
    | (((sub >>> 4) & 1) << 25)
    | (((sub >>> 15) & 1) << 24)
    | (((sub >>> 31) & 1) << 23)
    | (((sub >>> 17) & 1) << 22)
    | (((sub >>> 9) & 1) << 21)
    | (((sub >>> 6) & 1) << 20)
    | (((sub >>> 27) & 1) << 19)
    | (((sub >>> 14) & 1) << 18)
    | (((sub >>> 1) & 1) << 17)
    | (((sub >>> 22) & 1) << 16)
    | (((sub >>> 30) & 1) << 15)
    | (((sub >>> 24) & 1) << 14)
    | (((sub >>> 8) & 1) << 13)
    | (((sub >>> 18) & 1) << 12)
    | (((sub >>> 0) & 1) << 11)
    | (((sub >>> 5) & 1) << 10)
    | (((sub >>> 29) & 1) << 9)
    | (((sub >>> 23) & 1) << 8)
    | (((sub >>> 13) & 1) << 7)
    | (((sub >>> 19) & 1) << 6)
    | (((sub >>> 2) & 1) << 5)
    | (((sub >>> 26) & 1) << 4)
    | (((sub >>> 10) & 1) << 3)
    | (((sub >>> 21) & 1) << 2)
    | (((sub >>> 28) & 1) << 1)
    | ((sub >>> 7) & 1)
  ) >>> 0;
}

/** Single-DES encrypt/decrypt of one 8-byte block using a 16-round schedule. */
function cryptBlock(input: Uint8Array, schedule: readonly (readonly number[])[]): Uint8Array {
  let [s0, s1] = initialPermutation(input);

  for (let idx = 0; idx < 15; idx++) {
    const previousS1 = s1;
    s1 = (f(s1, schedule[idx]!) ^ s0) >>> 0;
    s0 = previousS1;
  }
  s0 = (f(s1, schedule[15]!) ^ s0) >>> 0;

  return inversePermutation(s0, s1);
}

/** DES key schedule (QQ non-standard PC-2 variant). Returns 16 rounds × 6 bytes. */
function keySchedule(key: Uint8Array, mode: number): number[][] {
  const schedule: number[][] = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0, 0]);

  const v0 = (key[0]! | (key[1]! << 8) | (key[2]! << 16) | (key[3]! << 24)) >>> 0;
  const v1 = (key[4]! | (key[5]! << 8) | (key[6]! << 16) | (key[7]! << 24)) >>> 0;

  let c = 0;
  for (let i = 0; i < KEY_PERM_C.length; i++) {
    const b = KEY_PERM_C[i]!;
    const bit = b < 32 ? ((v0 >>> (31 - b)) & 1) : ((v1 >>> (63 - b)) & 1);
    c |= bit << (31 - i);
  }
  let d = 0;
  for (let i = 0; i < KEY_PERM_D.length; i++) {
    const b = KEY_PERM_D[i]!;
    const bit = b < 32 ? ((v0 >>> (31 - b)) & 1) : ((v1 >>> (63 - b)) & 1);
    d |= bit << (31 - i);
  }

  for (let i = 0; i < 16; i++) {
    const shift = KEY_RND_SHIFT[i]!;
    c = (((c << shift) | (c >>> (28 - shift))) & 0xFFFFFFF0) >>> 0;
    d = (((d << shift) | (d >>> (28 - shift))) & 0xFFFFFFF0) >>> 0;

    const round = schedule[mode === DECRYPT ? 15 - i : i]!;

    for (let j = 0; j < 24; j++) {
      const bit = (c >>> (31 - KEY_COMPRESSION[j]!)) & 1;
      const idx = Math.floor(j / 8);
      round[idx] = (round[idx] ?? 0) | (bit << (7 - (j % 8)));
    }
    for (let j = 24; j < 48; j++) {
      const bit = (d >>> (31 - (KEY_COMPRESSION[j]! - 27))) & 1;
      const idx = Math.floor(j / 8);
      round[idx] = (round[idx] ?? 0) | (bit << (7 - (j % 8)));
    }
  }

  return schedule;
}

/** Triple-DES (EDE3) key setup from a 24-byte key. Returns 3 × 16-round schedules. */
function tripleDesKeySetup(key: Uint8Array, mode: number): number[][][] {
  const k1 = key.subarray(0, 8);
  const k2 = key.subarray(8, 16);
  const k3 = key.subarray(16, 24);
  if (mode === ENCRYPT) {
    return [
      keySchedule(k1, ENCRYPT),
      keySchedule(k2, DECRYPT),
      keySchedule(k3, ENCRYPT),
    ];
  }
  return [
    keySchedule(k3, DECRYPT),
    keySchedule(k2, ENCRYPT),
    keySchedule(k1, DECRYPT),
  ];
}

/** Triple-DES (EDE3) encrypt/decrypt of one 8-byte block across 3 schedules. */
function tripleDesCrypt(block: Uint8Array, schedules: readonly (readonly (readonly number[])[])[]): Uint8Array {
  let data = block;
  for (let i = 0; i < 3; i++) {
    data = cryptBlock(data, schedules[i]!);
  }
  return data;
}

/**
 * 3DES-decrypt every 8-byte block of an encrypted QRC payload, returning the
 * raw deflated bytes (a zlib stream, possibly zero-padded to the block
 * boundary). Exposed so the cipher layer can be tested independently of zlib
 * inflation.
 */
export function decryptQrcBlocks(cipher: Uint8Array): Buffer {
  if (cipher.length === 0 || cipher.length % 8 !== 0) {
    throw new Error("QRC ciphertext must be a non-empty multiple of 8 bytes.");
  }

  const schedules = tripleDesKeySetup(QRC_KEY, DECRYPT);
  const out = Buffer.allocUnsafe(cipher.length);
  for (let i = 0; i < cipher.length; i += 8) {
    const block = tripleDesCrypt(cipher.subarray(i, i + 8), schedules);
    out.set(block, i);
  }
  return out;
}

/**
 * Decrypt an encrypted QRC lyric payload to UTF-8 lyric text.
 *
 * @param encrypted - hex string, or the raw ciphertext bytes.
 * @returns the decrypted UTF-8 lyric text.
 * @throws when the payload is not valid encrypted QRC (truncated, bad zlib, etc.).
 *         Callers should treat a throw as "no usable lyrics for this track".
 */
export function qrcDecrypt(encrypted: string | Uint8Array): string {
  const cipher = typeof encrypted === "string"
    ? Buffer.from(encrypted, "hex")
    : Buffer.from(encrypted);

  return inflateSync(decryptQrcBlocks(cipher)).toString("utf8");
}
