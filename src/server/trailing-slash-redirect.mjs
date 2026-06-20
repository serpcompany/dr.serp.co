export function redirectTrailingSlash(request) {
  const url = new URL(request.url)
  const { pathname, search } = url

  if (pathname === "/" || !pathname.endsWith("/")) return null
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") return null

  const locationPath = pathname.replace(/\/+$/, "") || "/"
  return new Response("Redirecting...\n", {
    status: 308,
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/plain",
      Location: `${locationPath}${search}`,
    },
  })
}
