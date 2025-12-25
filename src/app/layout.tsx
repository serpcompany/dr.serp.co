import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Domain Rating Checker",
  description: "Check Domain Rating and generate a verified badge.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
