// Stripe statuses of a subscription that can still bill and change price. An unpaid one restarts
// once its open invoice is paid, so a second checkout would bill twice. A canceled one keeps paid
// access until its period ends, but it can't be updated, and its owner may buy again. Checkout,
// change-plan and the entitlement's hasLivePlan all read this one set.
export const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"])
