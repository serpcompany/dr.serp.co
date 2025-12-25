import { sql } from '@vercel/postgres'

const hasDb = Boolean(process.env.POSTGRES_URL)

async function ensureTables() {
  if (!hasDb) return
  await sql`
    CREATE TABLE IF NOT EXISTS dr_claims (
      domain TEXT PRIMARY KEY,
      email TEXT,
      domain_rating INT,
      provider TEXT,
      claimed_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

export async function getClaim(domain) {
  if (!hasDb) return null
  await ensureTables()
  const { rows } = await sql`
    SELECT domain, email, domain_rating, provider, claimed_at, updated_at
    FROM dr_claims
    WHERE domain = ${domain}
    LIMIT 1
  `
  return rows[0] || null
}

export async function upsertClaim({ domain, email = null, domainRating, provider = null }) {
  if (!hasDb) return null
  await ensureTables()
  const { rows } = await sql`
    INSERT INTO dr_claims (domain, email, domain_rating, provider)
    VALUES (${domain}, ${email}, ${domainRating}, ${provider})
    ON CONFLICT (domain)
    DO UPDATE SET
      email = COALESCE(EXCLUDED.email, dr_claims.email),
      domain_rating = EXCLUDED.domain_rating,
      provider = EXCLUDED.provider,
      updated_at = NOW()
    RETURNING domain, email, domain_rating, provider, claimed_at, updated_at
  `
  return rows[0] || null
}
