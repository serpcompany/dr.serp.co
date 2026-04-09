"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { LoginForm } from "@/components/login-form"
import { OTPForm } from "@/components/otp-form"
import { MySites } from "./my-sites"
import { AllSites } from "./all-sites"
import { BillingStatusCard } from "./billing-status-card"
import { upsertSiteHistory } from "@/lib/site-history"
import { Section, SectionDescription, SectionGroup, SectionHeader, SectionTitle } from "@/components/content/section"
import { ActionCard, ActionCardDescription, ActionCardGroup, ActionCardHeader, ActionCardTitle } from "@/components/content/action-card"
import {
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardHeader,
  FormCardTitle,
} from "@/components/forms/form-card"

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

  const handleDomainSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")
    if (!cleanDomain) return

    const email = authEmail.trim().toLowerCase()
    if (authStep === "authed" && email) {
      upsertSiteHistory(email, { domain: cleanDomain })
      fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, domain: cleanDomain }),
      }).catch(() => {})
    }
    router.push(`/sites/${encodeURIComponent(cleanDomain)}`)
  }

  return (
    <main className="w-full flex-1">
      <SectionGroup>
        <Section>
          <SectionHeader>
            <SectionTitle>Getting Started</SectionTitle>
            <SectionDescription>Verify your DR and generate an embeddable badge.</SectionDescription>
          </SectionHeader>
        </Section>

        <Section>
          <SectionHeader>
            <SectionDescription className="tabular-nums">
              Step <span className="font-medium text-foreground">1</span> of{" "}
              <span className="font-medium text-foreground">2</span>
            </SectionDescription>
          </SectionHeader>
          <FormCard>
            <FormCardHeader>
              <FormCardTitle>{authStep === "email" ? "Sign in" : authStep === "otp" ? "Verify code" : "Signed in"}</FormCardTitle>
              <FormCardDescription>
                {authStep === "email"
                  ? "Enter your email and we’ll send you a 6‑digit code."
                  : authStep === "otp"
                    ? "Enter the 6‑digit code we sent to your email."
                    : "You're ready to add a domain."}
              </FormCardDescription>
            </FormCardHeader>
            <FormCardContent>
              {authStep === "email" ? (
                <LoginForm
                  email={authEmail}
                  loading={authLoading}
                  error={authError}
                  onEmailChange={setAuthEmail}
                  onSubmit={requestOtp}
                />
              ) : authStep === "otp" ? (
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
              ) : (
                <div className="text-sm text-muted-foreground">Signed in as {authEmail.trim().toLowerCase()}.</div>
              )}
            </FormCardContent>
          </FormCard>
        </Section>

        <Section>
          <SectionHeader>
            <SectionDescription className="tabular-nums">
              Step <span className="font-medium text-foreground">2</span> of{" "}
              <span className="font-medium text-foreground">2</span>
            </SectionDescription>
          </SectionHeader>
          <FormCard className={authStep !== "authed" ? "pointer-events-none opacity-50" : ""}>
            <FormCardHeader>
              <FormCardTitle>Add a domain</FormCardTitle>
              <FormCardDescription>Look up a domain and generate a verified badge.</FormCardDescription>
            </FormCardHeader>
            <FormCardContent>
              <form onSubmit={handleDomainSubmit} className="flex gap-3">
                <Input
                  type="text"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  disabled={authStep !== "authed"}
                />
                <Button type="submit" disabled={authStep !== "authed" || !domain.trim()}>
                  Submit
                </Button>
              </form>
            </FormCardContent>
            {authStep !== "authed" ? (
              <FormCardFooter>
                <div className="text-sm text-muted-foreground">Complete step 1 to enable domain lookups.</div>
              </FormCardFooter>
            ) : null}
          </FormCard>
        </Section>

        {authStep === "authed" ? (
          <Section>
            <MySites email={authEmail} />
          </Section>
        ) : (
          <Section>
            <AllSites />
          </Section>
        )}

        {authStep === "authed" ? (
          <Section>
            <BillingStatusCard />
          </Section>
        ) : null}

        <Section>
          <SectionHeader>
            <SectionDescription>What&apos;s next?</SectionDescription>
          </SectionHeader>
          <ActionCardGroup className="sm:grid-cols-2">
            <Link href="/sites">
              <ActionCard className="h-full w-full">
                <ActionCardHeader>
                  <ActionCardTitle>Browse top sites</ActionCardTitle>
                  <ActionCardDescription>See the current leaderboard.</ActionCardDescription>
                </ActionCardHeader>
              </ActionCard>
            </Link>
            <Link href="/pricing">
              <ActionCard className="h-full w-full">
                <ActionCardHeader>
                  <ActionCardTitle>Pricing</ActionCardTitle>
                  <ActionCardDescription>Simple pricing while we ship the MVP.</ActionCardDescription>
                </ActionCardHeader>
              </ActionCard>
            </Link>
          </ActionCardGroup>
        </Section>
      </SectionGroup>
    </main>
  )
}
