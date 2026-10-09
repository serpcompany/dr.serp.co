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

export function ChangePlanDialog() {
  const router = useRouter()
  return (
    <AlertDialog defaultOpen onOpenChange={open => (open ? null : router.push('/account/billing'))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch to 50 sites for $15 a month?</AlertDialogTitle>
          <AlertDialogDescription>
            Stripe charges the difference for the rest of this month today, on your Visa ending
            4242. Your sites stay claimed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Switch plan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
