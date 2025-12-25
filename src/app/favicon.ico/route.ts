export const runtime = "nodejs"

export function GET() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
