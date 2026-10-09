'use client'

import { CreditCardIcon, GlobeIcon, LayoutDashboardIcon, LogOutIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { DISPLAY_EMAIL_KEY, signOut } from '@/components/auth/sign-in-api'
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
import { loginHref } from '@/lib/auth/callback-url'
import { readJsonRecord } from '@/lib/read-json'
import { cn } from '@/lib/utils'

// The header's account control (#140 mockups, Public · Header account menu): "Sign in" when
// signed out, else an avatar menu with the account's pages and Sign out. Pages that don't exist
// yet aren't listed.

function readEmail() {
  try {
    return window.localStorage.getItem(DISPLAY_EMAIL_KEY)?.trim().toLowerCase() || ''
  } catch {
    return ''
  }
}

function SignInLink({ path }: { path: string }) {
  return (
    <Link href={loginHref(path)} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
      Sign in
    </Link>
  )
}

/** The link with this page's query string, so /sites?q=…&page=3 comes back to the same results. */
function SignInLinkHere() {
  const pathname = usePathname() ?? '/'
  const search = useSearchParams()?.toString()
  return <SignInLink path={search ? `${pathname}?${search}` : pathname} />
}

export function AuthStatus() {
  const pathname = usePathname() ?? '/'
  const [email, setEmail] = useState('')

  useEffect(() => {
    setEmail(readEmail())

    const onStorage = (event: StorageEvent) => {
      if (event.key === DISPLAY_EMAIL_KEY) setEmail(readEmail())
    }
    window.addEventListener('storage', onStorage)

    // The HttpOnly session cookie is the source of truth; keep the stored display email in sync.
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
        if (sessionEmail) window.localStorage.setItem(DISPLAY_EMAIL_KEY, sessionEmail)
        else window.localStorage.removeItem(DISPLAY_EMAIL_KEY)
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

  if (!email) {
    // A static page doesn't know its query string on the server: it renders the link without it,
    // and the browser fills it in. A real href, so Cmd-click and Open in New Tab work too.
    return (
      <Suspense fallback={<SignInLink path={pathname} />}>
        <SignInLinkHere />
      </Suspense>
    )
  }

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
        <DropdownMenuItem
          onClick={async () => {
            await signOut()
            window.location.assign(pathname.startsWith('/account') ? '/' : pathname)
          }}
        >
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
