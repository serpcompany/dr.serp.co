import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { MagnifyingGlass, Link, Globe, Warning } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

interface AhrefsResponse {
  target: string
  domainRating: number
  backlinks: number
  refdomains: number
  dofollowBacklinks: number
  dofollowRefdomains: number
  provider?: string
}

function App() {
  const [authStep, setAuthStep] = useState<'email' | 'otp' | 'authed'>('email')
  const [authEmail, setAuthEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AhrefsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<{ hash?: string; question?: string } | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const savedEmail = window.localStorage.getItem('dr-auth-email')
    if (savedEmail) {
      setAuthEmail(savedEmail)
      setAuthStep('authed')
    }
  }, [])

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
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
        body: JSON.stringify({ email }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Failed to send code.'
        throw new Error(message)
      }

      setAuthStep('otp')
      setOtpCode('')
      setOtpToken(typeof payload?.token === 'string' ? payload.token : '')
      toast.success('Code sent to your email.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send code.'
      setAuthError(message)
      toast.error(message)
    } finally {
      setAuthLoading(false)
    }
  }

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
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
        body: JSON.stringify({ email, code: otpCode.trim(), token: otpToken }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Invalid code.'
        throw new Error(message)
      }

      window.localStorage.setItem('dr-auth-email', email)
      setAuthStep('authed')
      setOtpToken('')
      toast.success('You are logged in.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify code.'
      setAuthError(message)
      toast.error(message)
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = () => {
    window.localStorage.removeItem('dr-auth-email')
    setAuthStep('email')
    setAuthEmail('')
    setOtpCode('')
    setOtpToken('')
    setAuthError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!domain.trim()) {
      toast.error('Please enter a domain name')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)
    setCaptcha(null)
    setCaptchaAnswer('')

    try {
      const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
      const proxyBaseRaw = import.meta.env.VITE_AHREFS_PROXY_URL as string | undefined
      const defaultBase = import.meta.env.DEV ? 'http://localhost:5055' : ''
      const proxyBase = (proxyBaseRaw === undefined ? defaultBase : proxyBaseRaw).replace(/\/$/, '')
      const apiUrl = `${proxyBase}/api/ahrefs/domain-rating?target=${encodeURIComponent(cleanDomain)}`

      toast.info('Fetching Domain Rating...')

      const response = await fetch(apiUrl)
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`
        throw new Error(message)
      }

      if (payload?.captchaRequired) {
        const cap = payload?.captcha || {}
        const hash = typeof cap?.hash === 'string' ? cap.hash : undefined
        const question = typeof cap?.question === 'string' ? cap.question : payload?.message
        setCaptcha({ hash, question })
        toast.error('Captcha required by provider; please solve it to continue.')
        return
      }

      const domainRating = Number(payload?.domainRating)
      if (!Number.isFinite(domainRating)) {
        throw new Error('Invalid response from Ahrefs proxy (missing domainRating)')
      }

      setData({
        target: typeof payload?.target === 'string' ? payload.target : cleanDomain,
        domainRating,
        backlinks: 0,
        refdomains: 0,
        dofollowBacklinks: 0,
        dofollowRefdomains: 0,
        provider: typeof payload?.provider === 'string' ? payload.provider : undefined,
      })

      const savedEmail = window.localStorage.getItem('dr-auth-email')
      if (savedEmail) {
        fetch('/api/claims', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: cleanDomain,
            domainRating,
            provider: typeof payload?.provider === 'string' ? payload.provider : null,
            email: savedEmail,
          }),
        }).catch(() => {})
      }

      toast.success('Domain rating fetched successfully')
    } catch (err) {
      console.error('Fetch error:', err)
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      toast.error('Failed to fetch domain rating')
    } finally {
      setLoading(false)
    }
  }

  const handleCaptchaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!captcha?.hash) {
      toast.error('Missing captcha token; retry the lookup.')
      return
    }
    if (!captchaAnswer.trim()) {
      toast.error('Enter the captcha answer.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const cleanDomain = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
      const proxyBaseRaw = import.meta.env.VITE_AHREFS_PROXY_URL as string | undefined
      const defaultBase = import.meta.env.DEV ? 'http://localhost:5055' : ''
      const proxyBase = (proxyBaseRaw === undefined ? defaultBase : proxyBaseRaw).replace(/\/$/, '')
      const apiUrl =
        `${proxyBase}/api/ahrefs/domain-rating?target=${encodeURIComponent(cleanDomain)}` +
        `&provider=rhinorank&captcha_hash=${encodeURIComponent(captcha.hash)}` +
        `&captcha_answer=${encodeURIComponent(captchaAnswer.trim())}`

      const response = await fetch(apiUrl)
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`
        throw new Error(message)
      }

      if (payload?.captchaRequired) {
        toast.error('Captcha incorrect; try again.')
        return
      }

      const domainRating = Number(payload?.domainRating)
      if (!Number.isFinite(domainRating)) {
        throw new Error('Invalid response from provider (missing domainRating)')
      }

      setCaptcha(null)
      setCaptchaAnswer('')
      setData({
        target: typeof payload?.target === 'string' ? payload.target : cleanDomain,
        domainRating,
        backlinks: 0,
        refdomains: 0,
        dofollowBacklinks: 0,
        dofollowRefdomains: 0,
        provider: typeof payload?.provider === 'string' ? payload.provider : undefined,
      })

      const savedEmail = window.localStorage.getItem('dr-auth-email')
      if (savedEmail) {
        fetch('/api/claims', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: cleanDomain,
            domainRating,
            provider: typeof payload?.provider === 'string' ? payload.provider : null,
            email: savedEmail,
          }),
        }).catch(() => {})
      }

      toast.success('Domain rating fetched successfully')
    } catch (err) {
      console.error('Captcha fetch error:', err)
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      toast.error('Failed to fetch domain rating')
    } finally {
      setLoading(false)
    }
  }

  const domainRatingInt = data ? Math.floor(data.domainRating) : null
  const badgeTarget = data?.target || domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  const publicBase = import.meta.env.VITE_PUBLIC_BASE_URL || 'https://dr.serp.co'
  const badgeBase = import.meta.env.VITE_BADGE_BASE_URL || 'https://embeds.serp.co'
  const badgeUrl = badgeTarget ? `${badgeBase}/badge/${encodeURIComponent(badgeTarget)}` : ''
  const pageUrl = badgeTarget ? `${publicBase}/${encodeURIComponent(badgeTarget)}` : ''
  const embedSnippet = badgeUrl && pageUrl
    ? `<a href="${pageUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeUrl}" alt="Verified DR for ${badgeTarget}" width="200" height="50"></a>`
    : ''

  const handleCopyEmbed = async () => {
    if (!embedSnippet) return
    try {
      await navigator.clipboard.writeText(embedSnippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Embed code copied.')
    } catch (err) {
      console.error('Copy failed:', err)
      toast.error('Copy failed. Select and copy manually.')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Domain Rating Checker
          </h1>
          <p className="text-muted-foreground">
            Check the authority and backlink profile of any website
          </p>
        </div>

        {authStep !== 'authed' ? (
          <Card className="p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Log in to claim your DR page</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We send a one-time code to your email.
              </p>
            </div>

            {authStep === 'email' && (
              <form onSubmit={requestOtp} className="flex flex-col gap-4">
                <Input
                  type="email"
                  placeholder="you@domain.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  disabled={authLoading}
                  className="h-12 text-base"
                />
                {authError && <p className="text-sm text-destructive">{authError}</p>}
                <Button type="submit" disabled={authLoading || !authEmail.trim()}>
                  {authLoading ? 'Sending...' : 'Send code'}
                </Button>
              </form>
            )}

            {authStep === 'otp' && (
              <form onSubmit={verifyOtp} className="flex flex-col gap-4">
                <div className="text-sm text-muted-foreground">
                  Code sent to <span className="font-medium text-foreground">{authEmail}</span>
                </div>
                <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {authError && <p className="text-sm text-destructive">{authError}</p>}
                <div className="flex gap-3">
                  <Button type="submit" disabled={authLoading || otpCode.length !== 6} className="flex-1">
                    {authLoading ? 'Verifying...' : 'Verify code'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setAuthStep('email')} disabled={authLoading}>
                    Edit email
                  </Button>
                </div>
              </form>
            )}
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4 text-sm text-muted-foreground">
              <span>Signed in as {authEmail}</span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Log out
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
              <Input
                type="text"
                placeholder="example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={loading}
                className="flex-1 h-12 text-base"
                id="domain-input"
              />
              <Button
                type="submit"
                disabled={loading || !domain.trim()}
                className="h-12 px-6"
              >
                {loading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <MagnifyingGlass size={20} />
                  </motion.div>
                ) : (
                  <>
                    <MagnifyingGlass size={20} className="mr-2" />
                    Submit
                  </>
                )}
              </Button>
            </form>
          </>
        )}

        {error && (
          <Card className="p-6 bg-destructive/10 border-destructive/20">
            <div className="flex items-center gap-3 text-destructive">
              <Warning size={24} />
              <div>
                <p className="font-semibold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {captcha && !loading && (
          <Card className="p-6 mt-6">
            <p className="text-sm text-muted-foreground mb-3">
              {captcha.question || 'Complete the captcha to continue.'}
            </p>
            <form onSubmit={handleCaptchaSubmit} className="flex gap-3">
              <Input
                type="text"
                placeholder="Captcha answer"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                className="flex-1 h-12 text-base"
              />
              <Button type="submit" className="h-12 px-6" disabled={!captchaAnswer.trim()}>
                Submit
              </Button>
            </form>
          </Card>
        )}

        {loading && (
          <Card className="p-8">
            <div className="flex flex-col items-center">
              <Skeleton className="h-24 w-32 mb-4" />
              <Skeleton className="h-6 w-48 mb-8" />
              <div className="grid grid-cols-2 gap-6 w-full">
                <div>
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </div>
                <div>
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </div>
                <div>
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </div>
                <div>
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </div>
              </div>
            </div>
          </Card>
        )}

        {data && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="p-8">
              <div className="text-center mb-8">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="text-accent text-7xl md:text-8xl font-bold mb-2"
                >
                  {domainRatingInt}
                </motion.div>
                <p className="text-muted-foreground text-sm">Domain Rating</p>
              </div>

              {badgeUrl && pageUrl && (
                <div className="mb-8 rounded-lg border border-border p-4 flex flex-col items-center gap-2">
                  <img src={badgeUrl} alt={`Verified DR for ${badgeTarget}`} width={200} height={50} />
                  <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                    View your public page
                  </a>
                  <div className="w-full">
                    <p className="text-xs text-muted-foreground mb-2">Embed this badge:</p>
                    <pre className="text-xs bg-muted/60 rounded-md p-3 overflow-x-auto">{embedSnippet}</pre>
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3"
                      onClick={handleCopyEmbed}
                    >
                      {copied ? 'Copied' : 'Click to copy embed code'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Link size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Backlinks</p>
                    <p className="text-2xl font-semibold">{data.backlinks.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Globe size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Referring Domains</p>
                    <p className="text-2xl font-semibold">{data.refdomains.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-secondary rounded-lg">
                    <Link size={20} className="text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Dofollow Backlinks</p>
                    <p className="text-2xl font-semibold">{data.dofollowBacklinks.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-secondary rounded-lg">
                    <Globe size={20} className="text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Dofollow Refdomains</p>
                    <p className="text-2xl font-semibold">{data.dofollowRefdomains.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <Badge variant="secondary" className="text-xs">
                  Powered by Ahrefs
                </Badge>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default App
