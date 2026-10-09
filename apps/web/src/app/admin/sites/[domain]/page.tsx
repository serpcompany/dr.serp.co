'use client'

import { ArrowRightLeftIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { SITES } from '../../_mock/data'

const LINK_ITEMS = [
  { value: 'follow', label: 'Dofollow' },
  { value: 'nofollow', label: 'Nofollow' }
]

export default function AdminSitePage() {
  const domain = decodeURIComponent(String(useParams()?.domain ?? 'github.com'))
  const dialog = useSearchParams()?.get('dialog')
  const site = SITES.find(item => item.domain === domain) ?? SITES[0]

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>{site.domain}</CardTitle>
            <CardDescription>
              DR {site.dr ?? '—'} · last checked {site.lastChecked}
            </CardDescription>
            <CardAction>
              <Link href={`/sites/${site.domain}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                <ExternalLinkIcon />
                Public page
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="site-title">Title</FieldLabel>
                <Input id="site-title" defaultValue={site.title} />
                <FieldDescription>Shown as the page heading and in search results.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="site-description">Meta description</FieldLabel>
                <Textarea id="site-description" defaultValue={site.description} rows={3} />
              </Field>
              <Field>
                <FieldLabel htmlFor="site-link">Outbound link</FieldLabel>
                <Select items={LINK_ITEMS} defaultValue={site.link}>
                  <SelectTrigger id="site-link" className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_ITEMS.map(item => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Paid plans get a dofollow link automatically; this overrides it for this site.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="ghost">Discard</Button>
            <Button>Save changes</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DR history</CardTitle>
            <CardDescription>Every lookup, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Checked</TableHead>
                  <TableHead className="text-right">DR</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {site.checks.map((check, index) => (
                  <TableRow key={check.date}>
                    <TableCell>{check.date}</TableCell>
                    <TableCell className="text-right tabular-nums">{check.dr}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {index === 0 ? 'Scheduled recheck' : 'Owner recheck'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Claim</CardTitle>
            <CardDescription>
              {site.owner ? 'Claimed by a subscriber.' : 'Nobody has claimed this site.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {site.owner ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{site.owner}</span>
                <Badge variant="secondary">Owner</Badge>
              </div>
            ) : (
              <p className="text-muted-foreground">Assign it to a subscriber's email.</p>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Dialog defaultOpen={dialog === 'transfer'}>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                <ArrowRightLeftIcon />
                {site.owner ? 'Transfer' : 'Assign'}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{site.owner ? 'Transfer the claim' : 'Assign the claim'}</DialogTitle>
                  <DialogDescription>
                    The new owner sees {site.domain} in "Your sites" and gets its link benefits
                    from their plan. {site.owner ? `${site.owner} loses it.` : ''}
                  </DialogDescription>
                </DialogHeader>
                <Field>
                  <FieldLabel htmlFor="new-owner">New owner's email</FieldLabel>
                  <Input id="new-owner" type="email" placeholder="name@company.com" />
                  <FieldDescription>Must have an active plan with a free domain slot.</FieldDescription>
                </Field>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                  <Button>{site.owner ? 'Transfer' : 'Assign'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {site.owner ? (
              <Button variant="ghost" size="sm">
                Remove claim
              </Button>
            ) : null}
          </CardFooter>
        </Card>

        <Card className="ring-destructive/30">
          <CardHeader>
            <CardTitle>Delete site</CardTitle>
            <CardDescription>
              Removes the page, its DR history and any claim. The public URL answers 404.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <AlertDialog defaultOpen={dialog === 'delete'}>
              <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                <Trash2Icon />
                Delete {site.domain}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {site.domain}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the page, {site.checks.length} DR checks
                    {site.owner ? ` and ${site.owner}'s claim` : ''}. It can't be undone from the
                    admin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
