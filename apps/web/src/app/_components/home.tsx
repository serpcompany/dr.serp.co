'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DISPLAY_EMAIL_KEY } from '@/components/auth/sign-in-api'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { loginHref } from '@/lib/auth/callback-url'
import { upsertSiteHistory } from '@/lib/site-history'
import { cn } from '@/lib/utils'
import { AllSites } from './all-sites'
import { BillingStatusCard } from './billing-status-card'
import { MySites } from './my-sites'

export function Home() {
  const router = useRouter()

  // Signing in happens on /login (#136); this page only reads who is signed in.
  const [authEmail, setAuthEmail] = useState('')
  const authStep = authEmail ? 'authed' : 'signed-out'

  const [domain, setDomain] = useState('')

  useEffect(() => {
    try {
      setAuthEmail(window.localStorage.getItem(DISPLAY_EMAIL_KEY) ?? '')
    } catch {
      // Storage blocked: the page stays signed out.
    }
  }, [])

  const handleDomainSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanDomain = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    if (!cleanDomain) return

    const email = authEmail.trim().toLowerCase()
    if (authStep === 'authed' && email) {
      upsertSiteHistory(email, { domain: cleanDomain })
      // Adding a site while signed in claims it; browsing site pages never does.
      router.push(`/sites/${encodeURIComponent(cleanDomain)}?claim=1`)
      return
    }
    router.push(`/sites/${encodeURIComponent(cleanDomain)}`)
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Getting Started</h1>
        <p className="text-muted-foreground">Verify your DR and generate an embeddable badge.</p>
      </div>

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground tabular-nums">
          Step <span className="font-medium text-foreground">1</span> of{' '}
          <span className="font-medium text-foreground">2</span>
        </p>
        <Card>
          <CardHeader>
            <CardTitle>{authStep === 'authed' ? 'Signed in' : 'Sign in'}</CardTitle>
            <CardDescription>
              {authStep === 'authed'
                ? "You're ready to add a domain."
                : "Sign in with a code we email you. There's no password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authStep === 'authed' ? (
              <p className="text-sm text-muted-foreground">
                Signed in as {authEmail.trim().toLowerCase()}.
              </p>
            ) : (
              <Link href={loginHref('/add')} className={cn(buttonVariants())}>
                Sign in
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground tabular-nums">
          Step <span className="font-medium text-foreground">2</span> of{' '}
          <span className="font-medium text-foreground">2</span>
        </p>
        <Card className={authStep !== 'authed' ? 'pointer-events-none opacity-50' : ''}>
          <CardHeader>
            <CardTitle>Add a domain</CardTitle>
            <CardDescription>Look up a domain and generate a verified badge.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDomainSubmit} className="flex gap-3">
              <Input
                type="text"
                placeholder="example.com"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                disabled={authStep !== 'authed'}
              />
              <Button type="submit" disabled={authStep !== 'authed' || !domain.trim()}>
                Submit
              </Button>
            </form>
          </CardContent>
          {authStep !== 'authed' ? (
            <CardFooter>
              <p className="text-sm text-muted-foreground">
                Complete step 1 to enable domain lookups.
              </p>
            </CardFooter>
          ) : null}
        </Card>
      </div>

      {authStep === 'authed' ? <MySites email={authEmail} /> : <AllSites />}

      {authStep === 'authed' ? <BillingStatusCard /> : null}

      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">What&apos;s next?</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/sites">
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle>Browse top sites</CardTitle>
                <CardDescription>See the current leaderboard.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/pricing">
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>Simple pricing while we ship the MVP.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  )
}
