// The site's canonical origin, from configuration. Never build a URL from the request's Origin
// header, which the client controls.
export function getPublicBaseUrl() {
  return (process.env.DR_PUBLIC_BASE_URL || "https://dr.serp.co").replace(/\/+$/, "")
}
