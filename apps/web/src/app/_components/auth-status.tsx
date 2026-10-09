'use client'

import { CreditCardIcon, GlobeIcon, LayoutDashboardIcon, LogOutIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { readJsonRecord } from '@/lib/read-json'
import { cn } from '@/lib/utils'

function readEmail() {
  return window.localStorage.getItem('dr-auth-email')?.trim().toLowerCase() || ''
}

function clearLocalAuth() {
  window.localStorage.removeItem('dr-auth-email')
  window.sessionStorage.removeItem('dr-otp-email')
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
        const response = await fetch('/api/auth/get-session', {
          cache: 'no-store',
          signal: controller.signal
        })
        if (!response.ok) return
        // Better Auth answers null for no session, else { session, user }.
        const payload = await readJsonRecord(response)
        const user = payload?.user as { email?: unknown } | undefined
        const sessionEmail = typeof user?.email === 'string' ? user.email : ''
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
    // Better Auth refuses a POST without a JSON content type (415), even with no fields.
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).catch(() => null)
    clearLocalAuth()
    setEmail('')
    router.refresh()
    if (pathname !== '/add') router.push('/add')
  }

  if (!email) {
    return (
      <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
        Sign in
      </Link>
    )
  }

  // Mockup: the account menu replaces "Signed in as … / Log out".
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">{email.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/account" />}>
            <LayoutDashboardIcon />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account/sites" />}>
            <GlobeIcon />
            Your sites
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/account/billing" />}>
            <CreditCardIcon />
            Billing
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
