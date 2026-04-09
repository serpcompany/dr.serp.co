import Link from "next/link"

import { ThemeToggle } from "@/components/theme-toggle"

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="flex items-center justify-center gap-4 border-t border-border p-4">
      <p className="text-center text-muted-foreground text-sm">© {year} SERP DR</p>
      <div className="flex items-center gap-3 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Home
        </Link>
        <Link href="/sites" className="text-muted-foreground hover:text-foreground">
          Sites
        </Link>
        <Link href="/pricing" className="text-muted-foreground hover:text-foreground">
          Pricing
        </Link>
      </div>
      <ThemeToggle className="w-[180px]" />
    </footer>
  )
}
