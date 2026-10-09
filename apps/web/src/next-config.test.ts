// The old signed-in page's address keeps working: /add opens the add-site dialog in the account.
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { describe, expect, it } from 'vitest'
import config from '../next.config'

describe('next.config redirects', () => {
  it('sends /add to the account’s add-site dialog, permanently', async () => {
    const { redirects } = await config(PHASE_PRODUCTION_BUILD)
    expect(await redirects?.()).toContainEqual({
      source: '/add',
      destination: '/account/sites?add=1',
      permanent: true
    })
  })
})
