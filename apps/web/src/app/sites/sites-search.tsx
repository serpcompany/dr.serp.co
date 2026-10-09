'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

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
      const currentQuery = (currentParams.get('q') ?? '').trim()

      const nextValue = value.trim()
      if (nextValue) {
        currentParams.set('q', nextValue)
      } else {
        currentParams.delete('q')
      }

      if (nextValue !== currentQuery) {
        currentParams.delete('page')
      }

      const nextQs = currentParams.toString()
      const nextUrl = nextQs ? `/sites?${nextQs}` : '/sites'
      const currentQs = searchParams?.toString() ?? ''
      const currentUrl = currentQs ? `/sites?${currentQs}` : '/sites'

      if (nextUrl !== currentUrl) {
        startTransition(() => {
          router.replace(nextUrl)
        })
      }
    }, 250)

    return () => window.clearTimeout(handle)
  }, [router, searchParams, value])

  return (
    <InputGroup className="w-full sm:w-[320px]">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={event => setValue(event.target.value)}
        placeholder="Search domains…"
        aria-label="Search domains"
        disabled={isPending}
      />
    </InputGroup>
  )
}
