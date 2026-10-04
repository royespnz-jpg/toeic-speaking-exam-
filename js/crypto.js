// The exam versions are encrypted (scripts/build-exam.mjs): the public site
// holds them, but only the exam code the teacher gives out can open them.
// File: "TSE1" + salt (16 bytes) + iv (12 bytes) + AES-256-GCM ciphertext.

export const MAGIC = [0x54, 0x53, 0x45, 0x31]; // "TSE1"
export const ITERATIONS = 250000;

export const normalizeCode = (code) => String(code || '').trim().toUpperCase();

export class WrongCodeError extends Error {
  constructor() {
    super('That exam code is not right. Check it with your teacher.');
  }
}

export async function decrypt(buffer, code, iterations = ITERATIONS) {
  const bytes = new Uint8Array(buffer);
  if (MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('This exam file is damaged.');
  const salt = bytes.slice(4, 20);
  const iv = bytes.slice(20, 32);
  const { subtle } = globalThis.crypto;
  const base = await subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(32));
  } catch {
    throw new WrongCodeError();
  }
  return JSON.parse(new TextDecoder().decode(plain));
}
