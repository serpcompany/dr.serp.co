'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { EVENTS } from '../_mock/data'
import { LoadError, NoResults, TableSkeleton, useMockState } from '../_mock/states'

export default function AdminBillingAuditPage() {
  const state = useMockState()
  const events = [...EVENTS].sort((a, b) => Number(a.ok) - Number(b.ok))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing audit</CardTitle>
        <CardDescription>
          Every Stripe webhook event, failures first. Last event Oct 9, 09:14. Events older than 180 days are pruned.
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Switch id="failures-only" />
            <Label htmlFor="failures-only">Failures only</Label>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {state === 'loading' ? (
          <TableSkeleton columns={4} />
        ) : state === 'error' ? (
          <LoadError what="The billing audit" />
        ) : state === 'empty' ? (
          <NoResults title="No webhook events yet" description="Check the webhook endpoint in Stripe if subscribers exist." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map(event => (
                  <TableRow key={event.time + event.type}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{event.time}</TableCell>
                    <TableCell className="font-mono text-xs">{event.type}</TableCell>
                    <TableCell>{event.email}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal">
                      {event.ok ? (
                        <Badge variant="secondary">Recorded · {event.status}</Badge>
                      ) : (
                        <div className="space-y-1">
                          <Badge variant="destructive">Failed</Badge>
                          <p className="text-xs text-muted-foreground">{event.error}</p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
