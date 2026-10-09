// Delivers sign-in codes. Deployed environments send through useSend from the mail.serp.co
// no-reply sender (transactional-email.md, the serp.co-subdomain exception, which also asks for
// the "not monitored" footer). A local run without a useSend key prints the code to the dev
// server's terminal instead. Codes and recipients never reach a deployed log.
import type { AuthEnvironment } from './settings'

export type SignInCode = { email: string; otp: string; expiresInSeconds: number }

export type CodeSender = {
  /** False when this environment can't deliver email; the code request then answers 503. */
  ready(): boolean
  send(code: SignInCode): Promise<void>
}

const SENDER_NAME = 'SERP DR'
const DEFAULT_ADDRESS = 'no-reply@mail.serp.co'

/**
 * The From header: always "SERP DR", at the address USESEND_FROM names, so the secret only
 * chooses the mailbox. It may be a bare address, "Name <address>" or "address (Name)"; anything
 * else, or an address with spaces or angle brackets in it, falls back to the default.
 */
export function fromHeader(configured: string | undefined): string {
  const value = configured?.trim() ?? ''
  const address = /<\s*([^<>]*?)\s*>$/.exec(value)?.[1] ?? value.replace(/\s*\([^()]*\)$/, '')
  const valid = /^[^\s<>()",;@]+@[^\s<>()",;@]+$/.test(address)
  return `${SENDER_NAME} <${valid ? address : DEFAULT_ADDRESS}>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

/**
 * The sign-in code email (#140 mockups, Email). The subject leaves the code out, so it stays off
 * lock screens and notification previews. The code is one text node of bare digits, spaced only
 * by CSS letter-spacing, so it copies and pastes as one word (accounts-and-sign-in.md § Copying
 * and pasting codes). Colours are neutral greys a dark mail client can invert, and the footer
 * says replies aren't read (transactional-email.md, the serp.co-subdomain exception).
 */
export function signInEmail({ otp, expiresInSeconds }: SignInCode, siteUrl: string) {
  const minutes = Math.round(expiresInSeconds / 60)
  const subject = 'Your SERP DR sign-in code'
  const sitesUrl = `${siteUrl}/add`
  const sitesLabel = sitesUrl.replace(/^https?:\/\//, '')
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${subject}</title>
<style>
@media (prefers-color-scheme: dark) {
  .page { background: #1f1f1f !important; color: #ececec !important; }
  .card { background: #2a2a2a !important; border-color: #3a3a3a !important; }
  .muted { color: #a3a3a3 !important; }
  .code { background: #333333 !important; color: #ffffff !important; }
  .rule { border-top-color: #3a3a3a !important; }
  .link { color: #ececec !important; }
}
</style>
</head>
<body class="page" style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:${font};color:#18181b">
<table class="card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">
<tr><td style="padding:32px 28px">
<p style="margin:0;font-size:15px;font-weight:700">SERP DR</p>
<h1 style="margin:24px 0 8px;font-size:22px;font-weight:600">Your sign-in code</h1>
<p class="muted" style="margin:0;font-size:15px;line-height:1.6;color:#52525b">Enter this code on dr.serp.co, in the browser you asked from. It works for ${minutes} minutes.</p>
<p class="code" style="margin:24px 0;padding:18px 0;background:#f4f4f5;border-radius:10px;text-align:center;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:34px;font-weight:600;letter-spacing:0.3em">${escapeHtml(otp)}</p>
<p class="muted" style="margin:0;font-size:14px;line-height:1.6;color:#52525b">Didn&#39;t ask for it? Ignore this email. Nobody can sign in without the code.</p>
<hr class="rule" style="border:0;border-top:1px solid #e4e4e7;margin:28px 0 16px">
<p class="muted" style="margin:0;font-size:12px;line-height:1.6;color:#71717a">This address isn&#39;t monitored, so replies aren&#39;t read. Manage your sites at <a href="${sitesUrl}" class="link" style="color:#18181b">${sitesLabel}</a>.</p>
</td></tr>
</table>
</body>
</html>`
  const text = [
    'Your SERP DR sign-in code',
    '',
    otp,
    '',
    `Enter this code on dr.serp.co, in the browser you asked from. It works for ${minutes} minutes.`,
    "Didn't ask for it? Ignore this email. Nobody can sign in without the code.",
    '',
    `This address isn't monitored, so replies aren't read. Manage your sites at ${sitesUrl}.`
  ].join('\n')
  return { subject, html, text }
}

export function codeSenderFor(
  environment: AuthEnvironment,
  env: Record<string, string | undefined>,
  siteUrl: string,
  fetcher: typeof fetch = fetch
): CodeSender {
  const apiKey = env.USESEND_API_KEY?.trim()
  if (!apiKey && environment === 'local') {
    return {
      ready: () => true,
      async send({ email, otp }) {
        console.info(`[local sign-in code] ${email}: ${otp}`)
      }
    }
  }
  return {
    ready: () => Boolean(apiKey),
    async send(code) {
      const { subject, html, text } = signInEmail(code, siteUrl)
      const response = await fetcher('https://app.usesend.com/api/v1/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: code.email,
          from: fromHeader(env.USESEND_FROM),
          subject,
          html,
          text
        })
      })
      // The status says what failed; the recipient and code stay out of the log.
      if (!response.ok) throw new Error(`useSend refused the sign-in email (${response.status})`)
    }
  }
}
