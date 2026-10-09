'use client'

import { Laptop, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import * as React from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const THEMES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Laptop }
]

function ThemeLabel({ value }: { value: unknown }) {
  const theme = THEMES.find(item => item.value === value)
  if (!theme) return 'Select theme'
  return (
    <span className="flex items-center gap-2">
      <theme.Icon className="h-4 w-4" />
      <span>{theme.label}</span>
    </span>
  )
}

export function ThemeToggle({ className, ...props }: React.ComponentProps<typeof SelectTrigger>) {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // next-themes only knows the theme after mount, so the server and first render show the placeholder.
  return (
    <Select
      value={mounted ? (theme ?? null) : null}
      onValueChange={value => value && setTheme(value)}
    >
      <SelectTrigger className={className} {...props}>
        <SelectValue>{value => <ThemeLabel value={value} />}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {THEMES.map(item => (
          <SelectItem key={item.value} value={item.value}>
            <ThemeLabel value={item.value} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
