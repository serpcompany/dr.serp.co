// Purpose-bound keys derived from BETTER_AUTH_SECRET: Better Auth signs session cookies with the
// secret itself; every other use gets its own key, HMAC-SHA256(secret, label), so no two uses
// share key material and rotating the secret rotates them all.
export const RATE_LIMIT_KEY_LABEL = 'dr.serp.co/auth-rate-limit/v1'
export const KNOWN_DEVICE_KEY_LABEL = 'dr.serp.co/known-device/v1'
export const CODE_BINDING_KEY_LABEL = 'dr.serp.co/code-binding/v1'

const encoder = new TextEncoder()

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: string, value: string): Promise<ArrayBuffer> {
  const imported = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', imported, encoder.encode(value))
}

/** The derived key for `label`, as 64 hex characters. */
export async function deriveKey(secret: string, label: string): Promise<string> {
  if (!secret) throw new Error('A key can only be derived from a non-empty secret.')
  return toHex(await hmac(secret, label))
}

/** A digest of `value` under `key`, for rate-limit buckets that never hold a raw email or IP. */
export async function digest(key: string, value: string): Promise<string> {
  return toHex(await hmac(key, value)).slice(0, 32)
}
