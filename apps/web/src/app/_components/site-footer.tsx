import Link from 'next/link'

import { ThemeToggle } from '@/components/theme-toggle'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 border-t border-border p-4">
      <p className="text-center text-muted-foreground text-sm">© {year} SERP DR</p>
      <div className="flex items-center gap-3 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Home
        </Link>
        <Link href="/sites" className="text-muted-foreground hover:text-foreground">
          Sites
        </Link>
        <Link href="/add" className="text-muted-foreground hover:text-foreground">
          Add site
        </Link>
        <Link href="/pricing" className="text-muted-foreground hover:text-foreground">
          Pricing
        </Link>
      </div>
      <a
        href="https://serp.co/products/dr.serp.co/reviews/"
        target="_blank"
        rel="noopener noreferrer"
        title="Featured on SERP"
      >
        {/* biome-ignore lint/performance/noImgElement: a remote SVG badge */}
        <img
          src="https://serp.co/badge/featured-on-serp.co-light.svg"
          alt="Featured on SERP"
          width="200"
          height="50"
        />
      </a>
      <ThemeToggle />
    </footer>
  )
}
