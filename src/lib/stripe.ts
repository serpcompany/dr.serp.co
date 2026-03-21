import Stripe from "stripe"

import { getServerEnv } from "@/lib/env"

let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeClient) {
    const env = getServerEnv()
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY)
  }

  return stripeClient
}
