import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MagnifyingGlass, Link, Globe, Warning } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

interface AhrefsResponse {
  domainRating: number
  backlinks: number
  refdomains: number
  dofollowBacklinks: number
  dofollowRefdomains: number
  provider?: string
}

function App() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AhrefsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState<{ hash?: string; question?: string } | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')

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
        domainRating,
        backlinks: 0,
        refdomains: 0,
        dofollowBacklinks: 0,
        dofollowRefdomains: 0,
        provider: typeof payload?.provider === 'string' ? payload.provider : undefined,
      })
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
        domainRating,
        backlinks: 0,
        refdomains: 0,
        dofollowBacklinks: 0,
        dofollowRefdomains: 0,
        provider: typeof payload?.provider === 'string' ? payload.provider : undefined,
      })
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
                Check
              </>
            )}
          </Button>
        </form>

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
