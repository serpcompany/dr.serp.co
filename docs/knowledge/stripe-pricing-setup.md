# Stripe pricing setup notes

- The Stripe CLI defaults to test mode unless `--live` is provided.
- Ensure the CLI is authenticated to the correct Stripe account before creating products/prices.
- Use `stripe products create` + `stripe prices create` to generate price IDs, then paste them into `STRIPE_PRICE_IDS` as JSON.
- Keep price tiers in sync with `src/lib/pricing.ts` (domains 12/25/50/100).
