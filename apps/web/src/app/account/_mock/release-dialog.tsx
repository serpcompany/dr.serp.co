'use client'

import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

export function ReleaseDialog({ domain }: { domain: string }) {
  const router = useRouter()
  return (
    <AlertDialog defaultOpen onOpenChange={open => (open ? null : router.push('/account/sites'))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Release {domain}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its page stays public, but its link goes back to nofollow and it frees a slot on your
            plan. Anyone with a plan can claim it next, you included.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Release</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
