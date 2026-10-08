// Types for cloudflare-worker.js. The generated cloudflare-env.d.ts imports the Worker entry for its
// Durable Object and self-reference types; without this file the type checker would follow the
// entry's import of the OpenNext build output (.open-next/worker.js) and check that bundle too.
export { RateLimitDurableObject } from './src/server/rate-limit-do.mjs'

declare const worker: {
  fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response>
}
export default worker
