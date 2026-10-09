import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { PublicChrome } from '@/app/_components/public-chrome'
import { SiteFooter } from '@/app/_components/site-footer'
import { SiteHeader } from '@/app/_components/site-header'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Domain Rating Checker',
  description: 'Check Domain Rating and generate a verified badge.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn(geistSans.variable, geistMono.variable)} suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased font-sans flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PublicChrome>
            <SiteHeader />
          </PublicChrome>
          <div className="flex-1">{children}</div>
          <PublicChrome>
            <SiteFooter />
          </PublicChrome>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
