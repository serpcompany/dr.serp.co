import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import LoadingSitePage from './loading'

describe('site details loading state', () => {
  it('shows a clear long-running lookup message', () => {
    const html = renderToStaticMarkup(<LoadingSitePage />)

    expect(html).toContain('Loading site details')
    expect(html).toContain('badge preview')
  })
})
