/** The SERP wordmark with its block cursor, as serp.co's logo draws it, plus the site's name. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-1 text-base font-extrabold tracking-tight text-foreground">
      SERP
      <span aria-hidden="true" className="mb-0.5 inline-block h-3.5 w-1.5 self-end bg-primary" />
      <span className="ml-1 font-semibold text-muted-foreground">DR</span>
    </span>
  )
}
