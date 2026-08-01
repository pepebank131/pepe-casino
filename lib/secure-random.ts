import crypto from "crypto"

/** Cryptographically secure float in [0, 1). */
export function secureRandom(): number {
  const buf = crypto.randomBytes(6)
  const n = buf.readUIntBE(0, 6)
  return n / 0x1000000000000
}

/** Secure float in [0, max). */
export function secureRandomFloat(max: number): number {
  return secureRandom() * max
}
