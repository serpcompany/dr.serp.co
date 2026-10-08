import type { Metadata } from 'next'
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import { SiteFooter } from '@/app/_components/site-footer'
import { SiteHeader } from '@/app/_components/site-header'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

const _geistSans = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })
const _sourceSerif4 = Source_Serif_4({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Domain Rating Checker',
  description: 'Check Domain Rating and generate a verified badge.'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased font-sans flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
