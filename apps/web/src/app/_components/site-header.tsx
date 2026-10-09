import { Plus } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { Wordmark } from '@/components/wordmark'
import { cn } from '@/lib/utils'
import { AuthStatus } from './auth-status'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2">
      <div className="flex flex-1 items-center gap-2 px-3">
        <Link href="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          <Wordmark />
          <span className="sr-only"> home</span>
        </Link>
        <div className="hidden items-center gap-1 sm:flex">
          <Link href="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Home
          </Link>
          <Link href="/sites" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Sites
          </Link>
          <Link href="/pricing" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Pricing
          </Link>
        </div>
        <Link href="/add" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
          <Plus className="h-4 w-4" />
          Add site
        </Link>
      </div>
      <div className="ml-auto px-3">
        <AuthStatus />
      </div>
    </header>
  )
}
