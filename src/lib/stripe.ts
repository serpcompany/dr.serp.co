import Stripe from "stripe"

import { getServerEnv } from "@/lib/env"

// One client per secret key: the key is read on every call, and a changed key gets a new client.
let stripeClient: { key: string; client: Stripe } | null = null

export function getStripe(): Stripe {
  const key = getServerEnv().STRIPE_SECRET_KEY
  if (stripeClient?.key !== key) {
    stripeClient = { key, client: new Stripe(key) }
  }

  return stripeClient.client
}
