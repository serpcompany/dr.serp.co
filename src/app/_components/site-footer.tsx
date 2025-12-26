import Link from "next/link"

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">© {year} SERP DR</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
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
      </div>
    </footer>
  )
}

