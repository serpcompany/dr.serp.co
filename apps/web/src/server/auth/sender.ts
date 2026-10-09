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

const DEFAULT_FROM = 'DR Checker <no-reply@mail.serp.co>'

export function signInEmail({ otp, expiresInSeconds }: SignInCode, siteUrl: string) {
  const minutes = Math.round(expiresInSeconds / 60)
  const subject = 'Your DR Checker sign-in code'
  // The code is one text node of digits, so it copies and pastes cleanly (#136 styles it).
  const html = [
    `<p>Your DR Checker sign-in code is <strong>${otp}</strong>. It expires in ${minutes} minutes.</p>`,
    '<p>If you didn&#39;t ask for it, you can ignore this email.</p>',
    `<p><small>This address isn&#39;t monitored, so replies aren&#39;t read. Manage your sites at <a href="${siteUrl}/add">${siteUrl.replace(/^https?:\/\//, '')}/add</a>.</small></p>`
  ].join('\n')
  const text = [
    `Your DR Checker sign-in code is ${otp}. It expires in ${minutes} minutes.`,
    "If you didn't ask for it, you can ignore this email.",
    '',
    `This address isn't monitored, so replies aren't read. Manage your sites at ${siteUrl}/add.`
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
          from: env.USESEND_FROM || DEFAULT_FROM,
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
