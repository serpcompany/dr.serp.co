"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

function readEmail() {
  return window.localStorage.getItem("dr-auth-email")?.trim().toLowerCase() || ""
}

export function AuthStatus() {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState("")

  useEffect(() => {
    setEmail(readEmail())

    const onStorage = (event: StorageEvent) => {
      if (event.key === "dr-auth-email") setEmail(readEmail())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const logout = () => {
    window.localStorage.removeItem("dr-auth-email")
    window.sessionStorage.removeItem("dr-otp-email")
    window.sessionStorage.removeItem("dr-otp-token")
    setEmail("")
    router.refresh()
    if (pathname !== "/") router.push("/")
  }

  if (!email) {
    return (
      <Button asChild>
        <Link href="/">Log in</Link>
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="max-w-[180px] truncate text-xs text-muted-foreground">Signed in as {email}</span>
      <Button onClick={logout}>
        Log out
      </Button>
    </div>
  )
}
