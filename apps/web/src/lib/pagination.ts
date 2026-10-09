/**
 * The page links a paginated list shows: the first and last page, the current page and its
 * neighbors, and 'ellipsis' where pages are skipped. 1, …, 4, 5, 6, …, 10 for page 5 of 10.
 */
export function pageItems(current: number, total: number): Array<number | 'ellipsis'> {
  const pages = new Set([1, total, current - 1, current, current + 1])
  const visible = [...pages].filter(page => page >= 1 && page <= total).sort((a, b) => a - b)

  const items: Array<number | 'ellipsis'> = []
  for (const page of visible) {
    const previous = items.at(-1)
    if (typeof previous === 'number' && page - previous === 2) items.push(previous + 1)
    else if (typeof previous === 'number' && page - previous > 2) items.push('ellipsis')
    items.push(page)
  }
  return items
}
