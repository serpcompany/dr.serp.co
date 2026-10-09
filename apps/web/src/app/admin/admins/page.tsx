'use client'

import { PlusIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
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
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ADMINS } from '../_mock/data'

export default function AdminAdminsPage() {
  const dialog = useSearchParams()?.get('dialog')
  const only = useSearchParams()?.get('state') === 'last'
  const admins = only ? ADMINS.slice(0, 1) : ADMINS
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Admins</CardTitle>
        <CardDescription>
          Signed-in users with these emails can open this area. Removing one takes effect on their
          next request.
        </CardDescription>
        <CardAction>
          <Dialog defaultOpen={dialog === 'add'}>
            <DialogTrigger render={<Button size="sm" />}>
              <PlusIcon />
              Add admin
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add an admin</DialogTitle>
                <DialogDescription>
                  They get access the next time they sign in with this email. No invitation is sent.
                </DialogDescription>
              </DialogHeader>
              <Field>
                <FieldLabel htmlFor="admin-email">Email</FieldLabel>
                <Input id="admin-email" type="email" placeholder="name@serp.co" />
                <FieldDescription>In Production they also need the Cloudflare Access policy.</FieldDescription>
              </Field>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button>Add admin</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {admins.map(admin => (
            <Item key={admin.email} variant="outline" role="listitem">
              <ItemContent>
                <ItemTitle>
                  {admin.email}
                  {admin.you ? <Badge variant="secondary">You</Badge> : null}
                </ItemTitle>
                <ItemDescription>
                  Added {admin.addedAt} by {admin.addedBy}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {admins.length === 1 ? (
                  <Tooltip>
                    <TooltipTrigger render={<span tabIndex={0} />}>
                      <Button variant="ghost" size="sm" disabled>
                        Remove
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>The last admin can't be removed.</TooltipContent>
                  </Tooltip>
                ) : (
                  <AlertDialog defaultOpen={dialog === 'remove' && !admin.you}>
                    <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>Remove</AlertDialogTrigger>
                    <AlertDialogContent size="sm">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {admin.email}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {admin.you
                            ? "You'll lose access to this area on your next request."
                            : 'They lose access on their next request.'}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive">Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}
