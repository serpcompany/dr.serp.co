import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readJsonRecord } from '@/lib/read-json'

const purgeInvalidSiteDomains = vi.fn()

vi.mock('@/db', () => ({
  purgeInvalidSiteDomains
}))

const envBackup = { ...process.env }

function restoreEnv() {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

describe('POST /api/admin/sites/cleanup-invalid', () => {
  beforeEach(() => {
    purgeInvalidSiteDomains.mockReset()
    process.env.DR_ADMIN_TOKEN = 'admin-secret'
  })

  afterEach(() => {
    restoreEnv()
  })

  it('requires the admin token', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/sites/cleanup-invalid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized.')
    expect(purgeInvalidSiteDomains).not.toHaveBeenCalled()
  })

  it('refuses the admin token in the query string', async () => {
    const { POST } = await import('./route')
    const request = new Request(
      'http://localhost/api/admin/sites/cleanup-invalid?token=admin-secret',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(purgeInvalidSiteDomains).not.toHaveBeenCalled()
  })

  it('runs a dry-run cleanup by default', async () => {
    purgeInvalidSiteDomains.mockResolvedValue({
      claimCount: 3,
      checkCount: 8,
      domains: ['phpinfo.php'],
      dryRun: true
    })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/sites/cleanup-invalid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'admin-secret'
      },
      body: JSON.stringify({})
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(purgeInvalidSiteDomains).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true
      })
    )
  })
})
