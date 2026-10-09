import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { LoginCard } from '@/components/auth/login-card'
import { safeCallbackPath } from '@/lib/auth/callback-url'
import { getPublicBaseUrl } from '@/lib/public-url'
import { getSessionEmail } from '@/server/auth/session'

export const metadata: Metadata = {
  title: 'Sign in | SERP DR',
  robots: { index: false, follow: false }
}

// Reads the session cookie, so it renders per request.
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const callbackPath = safeCallbackPath(
    (await searchParams).callbackUrl,
    new URL(getPublicBaseUrl()).origin
  )
  const signedInEmail = await getSessionEmail({ headers: await headers() })
  return <LoginCard callbackPath={callbackPath} signedInEmail={signedInEmail} />
}
