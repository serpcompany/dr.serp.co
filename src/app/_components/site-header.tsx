import Link from "next/link"

import { Button } from "@/components/ui/button"
import { AuthStatus } from "./auth-status"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2">
      <div className="flex flex-1 items-center gap-2 px-3">
        <Link href="/" className="font-semibold">
            SERP DR
          </Link>
        <nav className="flex items-center gap-1">
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button asChild>
            <Link href="/sites">Sites</Link>
          </Button>
          <Button asChild>
            <Link href="/pricing">Pricing</Link>
          </Button>
        </nav>
      </div>
      <div className="ml-auto px-3">
        <AuthStatus />
      </div>
    </header>
  )
}
