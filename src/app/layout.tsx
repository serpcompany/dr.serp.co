import type { Metadata } from "next"
import "./globals.css"
import { SiteHeader } from "@/app/_components/site-header"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Domain Rating Checker",
  description: "Check Domain Rating and generate a verified badge.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-svh bg-background text-foreground antialiased">
        <SiteHeader />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
