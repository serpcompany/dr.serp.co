'use client'

import { AlertCircleIcon, ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { AddSiteForm } from './add-site-form'

const TITLE = 'Add a site'
const DESCRIPTION = 'Look up a domain to see its DR, then claim it for your account.'

function Body({ state }: { state: string }) {
  const domain = state === 'add' ? '' : state === 'add-limit' ? 'one-more.dev' : 'stripe.com'
  return (
    <div className="flex flex-col gap-4">
      <AddSiteForm value={domain} />
      {state === 'add-found' ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">stripe.com</p>
            <p className="truncate text-xs text-muted-foreground">
              Stripe | Financial Infrastructure to Grow Your Revenue
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-semibold tabular-nums">92</p>
            <p className="text-xs text-muted-foreground">DR</p>
          </div>
        </div>
      ) : null}
      {state === 'add-claimed' ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>stripe.com is claimed by another account</AlertTitle>
          <AlertDescription>
            A site has one owner. If it's yours, contact us from an address on the domain.
          </AlertDescription>
        </Alert>
      ) : null}
      {state === 'add-limit' ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>All 25 sites on your plan are claimed</AlertTitle>
          <AlertDescription>
            Release a site or move to the 50-site plan to claim one-more.dev.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function Action({ state }: { state: string }) {
  return state === 'add-limit' ? (
    <Button nativeButton={false} render={<Link href="/account/billing" />}>
      Change plan
      <ArrowRightIcon />
    </Button>
  ) : (
    <Button disabled={state !== 'add-found'}>Claim stripe.com</Button>
  )
}

/** shadcn's responsive dialog: a Dialog on desktop, a Drawer on phones. */
export function AddSiteDialog({ state }: { state: string }) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const close = (open: boolean) => (open ? null : router.push('/account/sites'))
  if (isMobile) {
    return (
      <Drawer defaultOpen onOpenChange={close}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">
            <Body state={state} />
          </div>
          <DrawerFooter>
            <Action state={state} />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog defaultOpen onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <Body state={state} />
        <DialogFooter>
          <Action state={state} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
