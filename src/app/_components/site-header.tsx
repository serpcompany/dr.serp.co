import Link from "next/link"

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-sm font-medium">
          SERP DR
        </Link>
        <a
          href="https://serp.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground"
        >
          serp.co
        </a>
      </div>
    </header>
  )
}

