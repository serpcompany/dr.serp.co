"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export default function SitesIndexPage() {
  const router = useRouter()
  const [value, setValue] = useState("")

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-[1200px] space-y-6">
        <header className="space-y-3 text-center">
          <div className="flex justify-center">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/">Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Sites</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <h1 className="scroll-m-20 text-3xl font-semibold tracking-tight">Sites</h1>
          <p className="text-muted-foreground text-sm">Look up a domain’s DR page.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Find a domain</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault()
                const q = value.trim()
                if (!q) return
                router.push(`/sites/${encodeURIComponent(q)}`)
              }}
            >
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="example.com"
                autoComplete="off"
              />
              <Button type="submit" className="sm:w-auto">
                Go
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
