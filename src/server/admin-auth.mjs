import crypto from "node:crypto"

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest()
}

/**
 * Checks an admin request's token. It is read only from the x-admin-token header, because a query
 * string ends up in logs and browser history, and compared in constant time.
 * @param {Request} request
 * @returns {{ status: number, error: string } | null} the refusal, or null when the token matches
 */
export function checkAdminToken(request) {
  const expected = process.env.DR_ADMIN_TOKEN
  if (!expected) return { status: 500, error: "Admin token not configured." }

  const provided = request.headers.get("x-admin-token") ?? ""
  // Fixed-length digests, so the comparison leaks neither the token's bytes nor its length.
  if (!provided || !crypto.timingSafeEqual(digest(provided), digest(expected))) {
    return { status: 401, error: "Unauthorized." }
  }
  return null
}
