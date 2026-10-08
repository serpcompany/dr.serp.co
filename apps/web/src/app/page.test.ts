import { describe, expect, it } from 'vitest'

describe('homepage', () => {
  it('reuses the /sites page component', async () => {
    const homeModule = await import('./page')
    const sitesModule = await import('./sites/page')

    expect(homeModule.default).toBe(sitesModule.default)
  })

  it('locks runtime settings to /sites', async () => {
    const homeModule = await import('./page')
    const sitesModule = await import('./sites/page')

    expect(homeModule.runtime).toBe(sitesModule.runtime)
    expect(homeModule.dynamic).toBe(sitesModule.dynamic)
  })
})
