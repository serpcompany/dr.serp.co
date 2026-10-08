import { redirect } from 'next/navigation'

import { normalizeTarget } from '@/server/dr-providers.mjs'

export const runtime = 'nodejs'

export default async function DomainShortcutPage({
  params
}: {
  params: Promise<{ target: string }>
}) {
  const { target } = await params
  const domain = normalizeTarget(target)
  if (!domain) redirect('/')
  redirect(`/sites/${encodeURIComponent(domain)}`)
}
