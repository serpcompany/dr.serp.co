type ServerEnv = {
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_IDS: string
  NEXT_PUBLIC_BASE_URL?: string
}

let cachedEnv: ServerEnv | null = null

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv

  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_IDS, NEXT_PUBLIC_BASE_URL } = process.env

  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required")
  }
  if (!STRIPE_PRICE_IDS) {
    throw new Error("STRIPE_PRICE_IDS is required")
  }

  cachedEnv = {
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_IDS,
    NEXT_PUBLIC_BASE_URL,
  }

  return cachedEnv
}

export function resetServerEnv() {
  cachedEnv = null
}
