'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import { readJsonRecord } from '@/lib/read-json'
import { cn } from '@/lib/utils'

function readEmail() {
  return window.localStorage.getItem('dr-auth-email')?.trim().toLowerCase() || ''
}

function clearLocalAuth() {
  window.localStorage.removeItem('dr-auth-email')
  window.sessionStorage.removeItem('dr-otp-email')
  window.sessionStorage.removeItem('dr-otp-token')
}

export function AuthStatus() {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState('')

  useEffect(() => {
    setEmail(readEmail())

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'dr-auth-email') setEmail(readEmail())
    }
    window.addEventListener('storage', onStorage)

    // The HttpOnly session cookie is the source of truth; keep the stored display email in sync with it.
    const controller = new AbortController()
    ;(async () => {
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
          signal: controller.signal
        })
        if (!response.ok) return
        const payload = await readJsonRecord(response)
        const sessionEmail = typeof payload?.email === 'string' ? payload.email : ''
        if (sessionEmail === readEmail()) return
        if (sessionEmail) {
          window.localStorage.setItem('dr-auth-email', sessionEmail)
        } else {
          clearLocalAuth()
        }
        // Other components read the stored email on mount, so reload once to pick up the change.
        window.location.reload()
      } catch {
        // Keep the current display state if the session check fails.
      }
    })()

    return () => {
      controller.abort()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const logout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => null)
    clearLocalAuth()
    setEmail('')
    router.refresh()
    if (pathname !== '/add') router.push('/add')
  }

  if (!email) {
    return (
      <Link href="/add" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
        Log in
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="max-w-[180px] truncate text-xs text-muted-foreground">
        Signed in as {email}
      </span>
      <Button variant="ghost" size="sm" onClick={() => void logout()}>
        Log out
      </Button>
    </div>
  )
}
