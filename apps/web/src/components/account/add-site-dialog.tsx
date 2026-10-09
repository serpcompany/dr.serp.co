'use client'

import { AlertCircleIcon, ArrowRightIcon, CircleCheckIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { claim, type Lookup, lookup } from './actions'

const TITLE = 'Add a site'
const DESCRIPTION = 'Look up a domain to see its DR, then claim it for your account.'

/** A domain from what was typed: no scheme, path or trailing dot. */
function cleanDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '')
    .toLowerCase()
}

/**
 * shadcn's responsive dialog (a Dialog on desktop, a Drawer on phones) for adding a site, built
 * to the #140 mockups: look the domain up, then claim it. `canClaim` is false when the plan has
 * no free slot or no plan is active; the server checks again on claim.
 */
export function AddSiteDialog({
  open,
  canClaim,
  limit
}: {
  open: boolean
  canClaim: boolean
  /** The plan's site limit, for the plan-full message. */
  limit: number | null
}) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [value, setValue] = useState('')
  const [site, setSite] = useState<Lookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [full, setFull] = useState(!canClaim)

  function close(next: boolean) {
    if (next) return
    setSite(null)
    setError(null)
    router.replace('/account/sites')
  }

  async function onLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const domain = cleanDomain(value)
    if (!domain) {
      setError('Enter a domain, like example.com.')
      return
    }
    setPending(true)
    setError(null)
    setSite(null)
    const result = await lookup(domain)
    setPending(false)
    if (result.ok) setSite(result.site)
    else setError(result.message)
  }

  async function onClaim() {
    if (!site) return
    setPending(true)
    const result = await claim(site.domain)
    setPending(false)
    if (result.ok) {
      toast.success(`Claimed ${site.domain}.`)
      router.replace(`/account/sites?site=${encodeURIComponent(site.domain)}`)
      router.refresh()
      return
    }
    if (result.kind === 'claimed-by-other') setSite({ ...site, owner: 'other' })
    else if (result.kind === 'upgrade') setFull(true)
    else setError(result.message)
  }

  const body = (
    <div className="flex flex-col gap-4">
      <form onSubmit={onLookup} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field data-invalid={error ? true : undefined} className="flex-1">
          <FieldLabel htmlFor="add-domain" className="sr-only">
            Domain
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="add-domain"
              placeholder="example.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={value}
              aria-invalid={error ? true : undefined}
              onChange={event => {
                setValue(event.target.value)
                setError(null)
              }}
            />
          </InputGroup>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <Button type="submit" disabled={pending || !value.trim()}>
          {pending && !site ? <Spinner data-icon="inline-start" /> : null}
          Look up
        </Button>
      </form>
      {site ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{site.domain}</p>
            <p className="truncate text-xs text-muted-foreground">
              {site.title ?? 'No title yet.'}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-semibold tabular-nums">{site.dr ?? '—'}</p>
            <p className="text-xs text-muted-foreground">DR</p>
          </div>
        </div>
      ) : null}
      {site?.owner === 'other' ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{site.domain} is claimed by another account</AlertTitle>
          <AlertDescription>A site has one owner.</AlertDescription>
        </Alert>
      ) : null}
      {site?.owner === 'you' ? (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{site.domain} is already yours</AlertTitle>
          <AlertDescription>It's in your sites.</AlertDescription>
        </Alert>
      ) : null}
      {site && site.owner === 'nobody' && site.dr === null ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>No DR for {site.domain} yet</AlertTitle>
          <AlertDescription>
            {site.note ?? "Its DR couldn't be looked up right now."} Try again later.
          </AlertDescription>
        </Alert>
      ) : null}
      {full && site?.owner === 'nobody' ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>
            {limit ? `All ${limit} sites on your plan are claimed` : 'Claiming needs a plan'}
          </AlertTitle>
          <AlertDescription>
            {limit
              ? `Release a site or move to a bigger plan to claim ${site.domain}.`
              : `Choose a plan to claim ${site.domain}.`}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )

  const action =
    full && site?.owner === 'nobody' ? (
      <Link href="/billing" className={cn(buttonVariants())}>
        {limit ? 'Change plan' : 'See plans'}
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    ) : site?.owner === 'you' ? (
      <Link
        href={`/account/sites?site=${encodeURIComponent(site.domain)}`}
        className={cn(buttonVariants())}
      >
        Open {site.domain}
      </Link>
    ) : (
      <Button
        disabled={pending || !site || site.owner !== 'nobody' || site.dr === null}
        onClick={() => void onClaim()}
      >
        {pending && site ? <Spinner data-icon="inline-start" /> : null}
        {site ? `Claim ${site.domain}` : 'Claim'}
      </Button>
    )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={close}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{body}</div>
          <DrawerFooter>{action}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{action}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
