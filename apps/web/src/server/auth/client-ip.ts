// The client address the sign-in limits count. Cloudflare sets cf-connecting-ip on every request
// that reaches the Worker. Only when the zone's Pseudo IPv4 rewrites headers does it hold a
// Class E (240.0.0.0/4) address hashed from the client's IPv6 address, with the real one in
// cf-connecting-ipv6; then the IPv6 /64 is the client. Anywhere else cf-connecting-ipv6 could come
// from the client itself, so it is ignored: trusting it would let a client pick its own key.

/** Requests with no valid client address share one bucket, which fails safe (stricter). */
export const UNKNOWN_IP = 'unknown'

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const IPV6_GROUP = /^[0-9a-f]{1,4}$/

/** The eight 16-bit groups of an IPv6 address (an embedded IPv4 tail becomes two), or null. */
function ipv6Groups(address: string): number[] | null {
  let value = address
  const lastColon = value.lastIndexOf(':')
  const embedded = value.slice(lastColon + 1)
  if (embedded.includes('.')) {
    if (!IPV4.test(embedded)) return null
    const [a = 0, b = 0, c = 0, d = 0] = embedded.split('.').map(Number)
    value = `${value.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = value.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part === '' ? [] : part.split(':'))
  const head = parse(halves[0] ?? '')
  const rest = halves.length === 2 ? parse(halves[1] ?? '') : []
  const present = [...head, ...rest]
  if (!present.every(group => IPV6_GROUP.test(group))) return null
  if (halves.length === 1 ? present.length !== 8 : present.length > 7) return null
  const zeros = Array<string>(8 - present.length).fill('0')
  const groups = halves.length === 2 ? [...head, ...zeros, ...rest] : present
  return groups.map(group => Number.parseInt(group, 16))
}

/**
 * An IPv4 address as is, an IPv4-mapped IPv6 address as its IPv4 address, any other IPv6 address
 * as its /64, and anything that isn't an IP address as UNKNOWN_IP.
 */
export function rateLimitAddress(value: string | null | undefined): string {
  const address = value?.trim().toLowerCase() ?? ''
  if (!address) return UNKNOWN_IP
  if (IPV4.test(address)) return address
  const groups = address.includes(':') ? ipv6Groups(address) : null
  if (!groups) return UNKNOWN_IP
  const [, , , , , marker = 0, high = 0, low = 0] = groups
  if (groups.slice(0, 5).every(group => group === 0) && marker === 0xffff) {
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
  }
  return `${groups
    .slice(0, 4)
    .map(group => group.toString(16))
    .join(':')}::/64`
}

function isPseudoIpv4(address: string): boolean {
  return IPV4.test(address) && Number(address.split('.')[0]) >= 240
}

export function clientIp(headers: Headers | undefined): string {
  const address = rateLimitAddress(headers?.get('cf-connecting-ip'))
  if (!isPseudoIpv4(address)) return address
  const ipv6 = rateLimitAddress(headers?.get('cf-connecting-ipv6'))
  return ipv6.endsWith('::/64') ? ipv6 : address
}
