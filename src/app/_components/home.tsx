"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"

import { LoginForm } from "@/components/login-form"
import { OTPForm } from "@/components/otp-form"

export function Home() {
  const router = useRouter()

  const [authStep, setAuthStep] = useState<"email" | "otp" | "authed">("email")
  const [authEmail, setAuthEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpToken, setOtpToken] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [domain, setDomain] = useState("")

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("dr-auth-email")
    if (savedEmail) {
      setAuthEmail(savedEmail)
      setAuthStep("authed")
      return
    }

    const pendingEmail = window.sessionStorage.getItem("dr-otp-email")
    const pendingToken = window.sessionStorage.getItem("dr-otp-token")
    if (pendingEmail && pendingToken) {
      setAuthEmail(pendingEmail)
      setOtpToken(pendingToken)
      setAuthStep("otp")
    }
  }, [])

  const requestOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = authEmail.trim().toLowerCase()
    if (!email) {
      setAuthError("Enter your email to continue.")
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "Failed to send code."
        throw new Error(message)
      }

      setAuthStep("otp")
      setOtpCode("")
      const token = typeof payload?.token === "string" ? payload.token : ""
      setOtpToken(token)
      if (token) {
        window.sessionStorage.setItem("dr-otp-email", email)
        window.sessionStorage.setItem("dr-otp-token", token)
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to send code.")
    } finally {
      setAuthLoading(false)
    }
  }

  const verifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = authEmail.trim().toLowerCase()
    if (!email || otpCode.trim().length !== 6) {
      setAuthError("Enter the 6-digit code.")
      return
    }

    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode.trim(), token: otpToken }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = typeof payload?.error === "string" ? payload.error : "Invalid code."
        throw new Error(message)
      }

      window.localStorage.setItem("dr-auth-email", email)
      window.sessionStorage.removeItem("dr-otp-email")
      window.sessionStorage.removeItem("dr-otp-token")
      setAuthStep("authed")
      setOtpToken("")
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to verify code.")
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = () => {
    window.localStorage.removeItem("dr-auth-email")
    window.sessionStorage.removeItem("dr-otp-email")
    window.sessionStorage.removeItem("dr-otp-token")
    setAuthStep("email")
    setAuthEmail("")
    setOtpCode("")
    setOtpToken("")
    setAuthError(null)
  }

  const handleDomainSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")
    if (!cleanDomain) return
    router.push(`/sites/${encodeURIComponent(cleanDomain)}`)
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl space-y-6">
        {authStep !== "authed" ? (
          <Card className="px-0">
            <CardContent className="px-6">
              {authStep === "email" ? (
                <LoginForm
                  email={authEmail}
                  loading={authLoading}
                  error={authError}
                  onEmailChange={setAuthEmail}
                  onSubmit={requestOtp}
                />
              ) : (
                <OTPForm
                  email={authEmail}
                  code={otpCode}
                  loading={authLoading}
                  error={authError}
                  onCodeChange={setOtpCode}
                  onSubmit={verifyOtp}
                  onEditEmail={() => {
                    window.sessionStorage.removeItem("dr-otp-email")
                    window.sessionStorage.removeItem("dr-otp-token")
                    setOtpToken("")
                    setOtpCode("")
                    setAuthStep("email")
                  }}
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <h1 className="text-xl font-semibold leading-none tracking-tight">
                Generate your DR page
              </h1>
              <CardDescription>
                Enter a domain to generate its permanent page and embeddable badge.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleDomainSubmit} className="flex gap-3">
                <Input
                  type="text"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="h-12 text-base"
                />
                <Button type="submit" disabled={!domain.trim()} className="h-12 px-6">
                  Submit
                </Button>
              </form>
            </CardContent>
            <CardFooter className="justify-between">
              <span className="text-sm text-muted-foreground">Signed in as {authEmail}</span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Log out
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </main>
  )
}
