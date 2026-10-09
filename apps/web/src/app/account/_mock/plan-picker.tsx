'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PRICING_TIERS } from '@/lib/pricing'

/** Billing period and size, as choice cards. `current` marks the plan the account has. */
export function PlanPicker({
  current,
  selected = current ?? '25'
}: {
  current?: string
  selected?: string
}) {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        value={[period]}
        onValueChange={value => (value[0] ? setPeriod(value[0] as 'monthly' | 'annual') : null)}
        variant="outline"
        spacing={0}
        className="self-start"
        aria-label="Billing period"
      >
        <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
        <ToggleGroupItem value="annual">
          Yearly
          <span className="text-xs text-muted-foreground">2 months free</span>
        </ToggleGroupItem>
      </ToggleGroup>
      <RadioGroup
        defaultValue={selected}
        className="grid gap-3 sm:grid-cols-2"
        aria-label="Plan size"
      >
        {PRICING_TIERS.map(tier => (
          <FieldLabel key={tier.id} htmlFor={`tier-${tier.id}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  {tier.domains} sites
                  {tier.id === current ? <Badge variant="secondary">Current</Badge> : null}
                </FieldTitle>
                <FieldDescription>
                  <span className="font-medium text-foreground">
                    ${period === 'annual' ? tier.annual : tier.monthly}
                  </span>{' '}
                  a {period === 'annual' ? 'year' : 'month'}
                </FieldDescription>
              </FieldContent>
              <RadioGroupItem value={tier.id} id={`tier-${tier.id}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </div>
  )
}
