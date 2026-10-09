'use client'

import { usePathname } from 'next/navigation'

// Mockup branch only: the account area, sign-in and the email preview have no public header or footer.
const OWN_CHROME = ['/account', '/login', '/mock']

export function PublicOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  return OWN_CHROME.some(prefix => pathname.startsWith(prefix)) ? null : children
}
