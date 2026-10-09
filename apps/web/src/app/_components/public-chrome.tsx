'use client'

import { usePathname } from 'next/navigation'

/** Pages with their own layout, where the public header and footer stay out (#140 mockups). */
const OWN_LAYOUT = ['/login', '/account']

/** Renders the public header or footer everywhere but the pages with their own layout. */
export function PublicChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  return OWN_LAYOUT.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ? null
    : children
}
