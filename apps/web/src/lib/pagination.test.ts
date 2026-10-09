import { describe, expect, it } from 'vitest'

import { pageItems } from './pagination'

describe('pageItems', () => {
  it('shows a single page alone', () => {
    expect(pageItems(1, 1)).toEqual([1])
  })

  it('lists every page when no gap is wider than one page', () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3])
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('fills a one-page gap with the page instead of an ellipsis', () => {
    expect(pageItems(4, 10)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 10])
  })

  it('collapses wider gaps on both sides of the current page', () => {
    expect(pageItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
  })

  it('keeps the first and last pages at either end', () => {
    expect(pageItems(1, 10)).toEqual([1, 2, 'ellipsis', 10])
    expect(pageItems(10, 10)).toEqual([1, 'ellipsis', 9, 10])
  })
})
