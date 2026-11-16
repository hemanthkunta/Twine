import * as ExpoCrypto from 'expo-crypto';

/**
 * Randomness and `globalThis.crypto` for React Native.
 *
 * Hermes has no WebCrypto implementation, and `libsignal-protocol-typescript`
 * decides which crypto backend to use while its own module body runs. This
 * module must therefore be imported *before* libsignal so that
 * `globalThis.crypto` exists by then — otherwise libsignal falls back to its
 * bundled `msrcrypto` polyfill, which is not part of the audited mobile stack.
 *
 * `expo-crypto` is the native CSPRNG. Its `getRandomBytes` helper falls back
 * to `Math.random` under remote JS debugging, so only `getRandomValues` (which
 * always reaches the native module) is used here.
 */

const platformCrypto = (globalThis as any).crypto;

export function fillRandomBytes(target: Uint8Array): Uint8Array {
  try {
    ExpoCrypto.getRandomValues(target);
    return target;
  } catch {
    if (platformCrypto?.getRandomValues) {
      platformCrypto.getRandomValues(target);
      return target;
    }
    throw new Error('No cryptographically secure random source is available');
  }
}

export function randomBytes(length: number): Uint8Array {
  return fillRandomBytes(new Uint8Array(length));
}

const globalCrypto = (globalThis as any).crypto;
if (!globalCrypto) {
  (globalThis as any).crypto = { getRandomValues: fillRandomBytes };
} else if (typeof globalCrypto.getRandomValues !== 'function') {
  globalCrypto.getRandomValues = fillRandomBytes;
}

export default fillRandomBytes;
