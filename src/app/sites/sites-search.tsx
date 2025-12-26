"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"

export function SitesSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [value, setValue] = useState(initialQuery)

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const currentParams = new URLSearchParams(searchParams?.toString())
      const currentQuery = (currentParams.get("q") ?? "").trim()

      const nextValue = value.trim()
      if (nextValue) {
        currentParams.set("q", nextValue)
      } else {
        currentParams.delete("q")
      }

      if (nextValue !== currentQuery) {
        currentParams.delete("page")
      }

      const nextQs = currentParams.toString()
      const nextUrl = nextQs ? `/sites?${nextQs}` : "/sites"
      const currentQs = searchParams?.toString() ?? ""
      const currentUrl = currentQs ? `/sites?${currentQs}` : "/sites"

      if (nextUrl !== currentUrl) {
        startTransition(() => {
          router.replace(nextUrl)
        })
      }
    }, 250)

    return () => window.clearTimeout(handle)
  }, [router, searchParams, startTransition, value])

  return (
    <div className="relative w-full sm:w-[320px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search domains…"
        className="pl-9"
        disabled={isPending}
      />
    </div>
  )
}
