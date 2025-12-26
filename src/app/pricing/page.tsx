import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <div className="space-y-10">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-sm text-muted-foreground">Simple pricing while we ship the MVP.</p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <CardDescription>Generate shareable pages and badges.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">$0</p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Public DR page per domain</li>
                <li>Embeddable verified badge</li>
                <li>Recheck button (best-effort)</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                <Link href="/">Get started</Link>
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pro</CardTitle>
              <CardDescription>For teams and higher volume.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">Contact</p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Higher rate limits</li>
                <li>Priority support</li>
                <li>Custom badge designs</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" asChild className="w-full">
                <a href="mailto:devin@serp.co?subject=DR%20Badge%20Pro">Email us</a>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  )
}

