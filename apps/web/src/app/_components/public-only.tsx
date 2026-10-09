'use client'

import { usePathname } from 'next/navigation'

// Mockup branch only: the admin area has no public header or footer.
export function PublicOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return pathname?.startsWith('/admin') ? null : children
}
