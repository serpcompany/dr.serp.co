import Link from "next/link"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AuthStatus } from "./auth-status"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2">
      <div className="flex flex-1 items-center gap-2 px-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/" className="font-semibold">
            SERP DR
          </Link>
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sites">Sites</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/pricing">Pricing</Link>
          </Button>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/add">
            <Plus className="h-4 w-4" />
            Add site
          </Link>
        </Button>
      </div>
      <div className="ml-auto px-3">
        <AuthStatus />
      </div>
    </header>
  )
}
