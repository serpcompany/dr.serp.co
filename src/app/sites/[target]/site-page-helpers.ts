import type { Metadata } from "next"

const SITE_NAME = "SERP DR"

function toTitleCase(value: string) {
  return value.replace(/\b[a-z]/g, (char) => char.toUpperCase())
}

export function formatDomainLabel(domain: string) {
  return String(domain ?? "")
    .trim()
    .split(".")
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 3) return part.toUpperCase()
      return toTitleCase(part.replace(/[-_]+/g, " "))
    })
    .join(" ")
}

export function getPageSiteTitle({
  siteTitle,
  domain,
}: {
  siteTitle: string | null | undefined
  domain: string
}) {
  const normalized = String(siteTitle ?? "").trim()
  return normalized || formatDomainLabel(domain)
}

export function getPageSiteDescription({
  metaDescription,
  domain,
}: {
  metaDescription: string | null | undefined
  domain: string
}) {
  const normalized = String(metaDescription ?? "").trim()
  return normalized || `View the latest Domain Rating snapshot, badge, and profile details for ${domain} on ${SITE_NAME}.`
}

export function buildSitePageMetadata({
  pageSiteTitle,
  description,
}: {
  pageSiteTitle: string
  description: string
}): Metadata {
  return {
    title: `${pageSiteTitle} | ${SITE_NAME}`,
    description,
  }
}

export function getOutboundLinkProps(isPaidLink: boolean) {
  return {
    rel: isPaidLink ? "noopener noreferrer" : "nofollow noopener noreferrer",
    target: "_blank",
  }
}
