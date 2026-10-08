'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LoginForm } from '@/components/login-form'
import { OTPForm } from '@/components/otp-form'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { readJsonRecord } from '@/lib/read-json'
import { upsertSiteHistory } from '@/lib/site-history'
import { AllSites } from './all-sites'
import { BillingStatusCard } from './billing-status-card'
import { MySites } from './my-sites'

export function Home() {
  const router = useRouter()

  const [authStep, setAuthStep] = useState<'email' | 'otp' | 'authed'>('email')
  const [authEmail, setAuthEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [domain, setDomain] = useState('')

  useEffect(() => {
    const savedEmail = window.localStorage.getItem('dr-auth-email')
    if (savedEmail) {
      setAuthEmail(savedEmail)
      setAuthStep('authed')
      return
    }

    const pendingEmail = window.sessionStorage.getItem('dr-otp-email')
    const pendingToken = window.sessionStorage.getItem('dr-otp-token')
    if (pendingEmail && pendingToken) {
      setAuthEmail(pendingEmail)
      setOtpToken(pendingToken)
      setAuthStep('otp')
    }
  }, [])

  const requestOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = authEmail.trim().toLowerCase()
    if (!email) {
      setAuthError('Enter your email to continue.')
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const payload = await readJsonRecord(response)

      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Failed to send code.'
        throw new Error(message)
      }

      setAuthStep('otp')
      setOtpCode('')
      const token = typeof payload?.token === 'string' ? payload.token : ''
      setOtpToken(token)
      if (token) {
        window.sessionStorage.setItem('dr-otp-email', email)
        window.sessionStorage.setItem('dr-otp-token', token)
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to send code.')
    } finally {
      setAuthLoading(false)
    }
  }

  const verifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = authEmail.trim().toLowerCase()
    if (!email || otpCode.trim().length !== 6) {
      setAuthError('Enter the 6-digit code.')
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode.trim(), token: otpToken })
      })
      const payload = await readJsonRecord(response)

      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Invalid code.'
        throw new Error(message)
      }

      window.localStorage.setItem('dr-auth-email', email)
      window.sessionStorage.removeItem('dr-otp-email')
      window.sessionStorage.removeItem('dr-otp-token')
      setAuthStep('authed')
      setOtpToken('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to verify code.')
    } finally {
      setAuthLoading(false)
    }
  }

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
            <CardTitle>
              {authStep === 'email' ? 'Sign in' : authStep === 'otp' ? 'Verify code' : 'Signed in'}
            </CardTitle>
            <CardDescription>
              {authStep === 'email'
                ? "Enter your email and we'll send you a 6-digit code."
                : authStep === 'otp'
                  ? 'Enter the 6-digit code we sent to your email.'
                  : "You're ready to add a domain."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authStep === 'email' ? (
              <LoginForm
                email={authEmail}
                loading={authLoading}
                error={authError}
                onEmailChange={setAuthEmail}
                onSubmit={requestOtp}
              />
            ) : authStep === 'otp' ? (
              <OTPForm
                email={authEmail}
                code={otpCode}
                loading={authLoading}
                error={authError}
                onCodeChange={setOtpCode}
                onSubmit={verifyOtp}
                onEditEmail={() => {
                  window.sessionStorage.removeItem('dr-otp-email')
                  window.sessionStorage.removeItem('dr-otp-token')
                  setOtpToken('')
                  setOtpCode('')
                  setAuthStep('email')
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Signed in as {authEmail.trim().toLowerCase()}.
              </p>
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
