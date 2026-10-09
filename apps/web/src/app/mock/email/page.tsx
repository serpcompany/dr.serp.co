import { stateOf } from '@/app/account/_mock/data'

// Mockup branch only: the sign-in code email as a mail client shows it, light or dark.
export default async function EmailMock({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const dark = (await stateOf(searchParams)) === 'dark'
  const c = dark
    ? {
        page: '#1f1f1f',
        card: '#2a2a2a',
        text: '#ececec',
        muted: '#a3a3a3',
        line: '#3a3a3a',
        code: '#333333'
      }
    : {
        page: '#f4f4f5',
        card: '#ffffff',
        text: '#18181b',
        muted: '#71717a',
        line: '#e4e4e7',
        code: '#f4f4f5'
      }
  return (
    <div
      style={{
        background: c.page,
        color: c.text,
        minHeight: '100svh',
        padding: '24px 12px',
        fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      <div
        style={{
          maxWidth: 600,
          margin: '0 auto 16px',
          fontSize: 13,
          color: c.muted,
          lineHeight: 1.6
        }}
      >
        <div>
          <b style={{ color: c.text }}>SERP DR</b> &lt;no-reply@mail.serp.co&gt;
        </div>
        <div>
          Subject: <span style={{ color: c.text }}>Your SERP DR sign-in code</span>
        </div>
      </div>
      <div
        style={{
          maxWidth: 600,
          margin: '0 auto',
          background: c.card,
          border: `1px solid ${c.line}`,
          borderRadius: 12,
          padding: '32px 28px'
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15 }}>SERP DR</div>
        <h1 style={{ fontSize: 22, margin: '24px 0 8px', fontWeight: 600 }}>Your sign-in code</h1>
        <p style={{ margin: 0, color: c.muted, fontSize: 15, lineHeight: 1.6 }}>
          Enter this code on dr.serp.co, in the browser you asked from. It works for 10 minutes.
        </p>
        <div
          style={{
            margin: '24px 0',
            background: c.code,
            borderRadius: 10,
            padding: '18px 0',
            textAlign: 'center',
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: '0.3em'
          }}
        >
          482913
        </div>
        <p style={{ margin: 0, color: c.muted, fontSize: 14, lineHeight: 1.6 }}>
          Didn't ask for it? Ignore this email. Nobody can sign in without the code.
        </p>
        <hr style={{ border: 0, borderTop: `1px solid ${c.line}`, margin: '28px 0 16px' }} />
        <p style={{ margin: 0, color: c.muted, fontSize: 12, lineHeight: 1.6 }}>
          This address isn't monitored, so replies aren't read. Manage your sites at{' '}
          <a href="https://dr.serp.co/account" style={{ color: c.text }}>
            dr.serp.co/account
          </a>
          .
        </p>
      </div>
    </div>
  )
}
