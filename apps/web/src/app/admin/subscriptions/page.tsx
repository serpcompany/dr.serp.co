'use client'

import { ExternalLinkIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { type MockSubscription, SUBSCRIPTIONS } from '../_mock/data'
import { LoadError, NoResults, TableSkeleton, useMockState } from '../_mock/states'

const STATUS: Record<MockSubscription['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'secondary' },
  trialing: { label: 'Trial', variant: 'secondary' },
  past_due: { label: 'Past due', variant: 'destructive' },
  canceled: { label: 'Canceled', variant: 'outline' }
}

export default function AdminSubscriptionsPage() {
  const state = useMockState()
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Active', '4', '61 of 199 domains used'],
          ['Past due', '1', 'Unpaid invoice since Oct 2'],
          ['Ending', '1', 'Cancels Oct 15']
        ].map(([label, value, note]) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
              <CardDescription>{note}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>From Stripe through the webhook. Change plans in Stripe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="live">
            <TabsList>
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="past_due">Past due</TabsTrigger>
              <TabsTrigger value="canceled">Canceled</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          {state === 'loading' ? (
            <TableSkeleton columns={5} />
          ) : state === 'error' ? (
            <LoadError what="Subscriptions" />
          ) : state === 'empty' ? (
            <NoResults title="No subscriptions yet" description="They appear here after a checkout completes." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Domains used</TableHead>
                    <TableHead>Renews</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Stripe</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SUBSCRIPTIONS.map(sub => (
                    <TableRow key={sub.email}>
                      <TableCell className="font-medium">{sub.email}</TableCell>
                      <TableCell>
                        {sub.domains} domains · {sub.interval}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS[sub.status].variant}>{STATUS[sub.status].label}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sub.used}/{sub.domains}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {sub.status === 'canceled' ? `Ended ${sub.renews}` : sub.cancelAtPeriodEnd ? `Ends ${sub.renews}` : sub.renews}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://dashboard.stripe.com/customers/${sub.customer}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${sub.email} in Stripe`}
                          className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
                        >
                          <ExternalLinkIcon />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
