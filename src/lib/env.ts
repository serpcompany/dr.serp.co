// Configuration is read on each call, never cached at module scope: OpenNext fills process.env from
// the Worker's environment per request, and an isolate must not keep the values it loaded with.
// A source test (env-reads.test.ts) fails if a module reads process.env outside a function.

type ServerEnv = {
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_IDS: string
  NEXT_PUBLIC_BASE_URL?: string
}

export function getServerEnv(): ServerEnv {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_IDS, NEXT_PUBLIC_BASE_URL } = process.env

  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required")
  }
  if (!STRIPE_PRICE_IDS) {
    throw new Error("STRIPE_PRICE_IDS is required")
  }

  return {
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_IDS,
    NEXT_PUBLIC_BASE_URL,
  }
}

// A numeric setting such as a rate limit, with its default when unset.
export function readNumberEnv(name: string, fallback: number): number {
  return Number(process.env[name] ?? fallback)
}
