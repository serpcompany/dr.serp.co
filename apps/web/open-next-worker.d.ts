// The OpenNext build output, imported by worker.ts under the `open-next-worker` alias
// (wrangler.jsonc). Declaring it here keeps the type checker out of the bundle.
declare module 'open-next-worker' {
  const openNextWorker: {
    fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response>
  }
  export default openNextWorker
}
