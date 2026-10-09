'use client'

import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { signOut } from '@/components/auth/sign-in-api'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** Light, dark or the system's, on this device (next-themes). */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  // The stored theme is only known in the browser; until then nothing is pressed.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <ToggleGroup
      value={mounted && theme ? [theme] : []}
      onValueChange={value => (value[0] ? setTheme(value[0]) : null)}
      variant="outline"
      spacing={0}
      aria-label="Theme"
    >
      <ToggleGroupItem value="light">
        <SunIcon />
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark">
        <MoonIcon />
        Dark
      </ToggleGroupItem>
      <ToggleGroupItem value="system">
        <MonitorIcon />
        System
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** Ends this browser's session and goes home. */
export function SignOutButton() {
  const [pending, setPending] = useState(false)
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await signOut()
        window.location.assign('/')
      }}
    >
      {pending ? <Spinner data-icon="inline-start" /> : <LogOutIcon data-icon="inline-start" />}
      Sign out
    </Button>
  )
}
