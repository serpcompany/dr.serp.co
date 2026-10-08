import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readJsonRecord } from '@/lib/read-json'

const countPrunableBillingAudit = vi.fn()
const pruneBillingAudit = vi.fn()

vi.mock('@/server/db.mjs', () => ({
  countPrunableBillingAudit,
  pruneBillingAudit
}))

const envBackup = { ...process.env }

function restoreEnv() {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, envBackup)
}

describe('POST /api/admin/billing/prune-audit', () => {
  beforeEach(() => {
    countPrunableBillingAudit.mockReset()
    pruneBillingAudit.mockReset()
    process.env.DR_ADMIN_TOKEN = 'admin-secret'
  })

  afterEach(() => {
    restoreEnv()
  })

  it('requires the admin token', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/billing/prune-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized.')
    expect(countPrunableBillingAudit).not.toHaveBeenCalled()
    expect(pruneBillingAudit).not.toHaveBeenCalled()
  })

  it('counts removable records by default', async () => {
    countPrunableBillingAudit.mockResolvedValue({
      count: 7,
      cutoff: new Date('2026-01-01T00:00:00.000Z')
    })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/billing/prune-audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'admin-secret'
      },
      body: JSON.stringify({ olderThanDays: 90 })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      dryRun: true,
      olderThanDays: 90,
      removable: 7,
      cutoff: '2026-01-01T00:00:00.000Z'
    })
    expect(countPrunableBillingAudit).toHaveBeenCalledWith({ olderThanDays: 90 })
    expect(pruneBillingAudit).not.toHaveBeenCalled()
  })

  it('prunes records only when dryRun is false', async () => {
    pruneBillingAudit.mockResolvedValue({
      removed: 3,
      cutoff: new Date('2026-02-01T00:00:00.000Z')
    })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/admin/billing/prune-audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': 'admin-secret'
      },
      body: JSON.stringify({ olderThanDays: 45, dryRun: false })
    })

    const response = await POST(request)
    const payload = await readJsonRecord(response)

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      dryRun: false,
      olderThanDays: 45,
      removed: 3,
      cutoff: '2026-02-01T00:00:00.000Z'
    })
    expect(pruneBillingAudit).toHaveBeenCalledWith({ olderThanDays: 45 })
  })
})
