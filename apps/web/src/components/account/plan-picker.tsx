'use client'

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
import { type BillingPeriod, type PlanChoice, PRICING_TIERS } from '@/lib/pricing'

/**
 * The billing period and the plan size as choice cards (#140 mockups, Billing and Pricing).
 * `current` marks the account's plan.
 */
export function PlanPicker({
  value,
  onChange,
  current
}: {
  value: PlanChoice
  onChange: (value: PlanChoice) => void
  current?: PlanChoice | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        value={[value.billing]}
        onValueChange={next =>
          next[0] ? onChange({ ...value, billing: next[0] as BillingPeriod }) : null
        }
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
        value={String(value.domains)}
        onValueChange={next => onChange({ ...value, domains: Number(next) })}
        className="grid gap-3 sm:grid-cols-2"
        aria-label="Plan size"
      >
        {PRICING_TIERS.map(tier => {
          const isCurrent = current?.domains === tier.domains && current.billing === value.billing
          return (
            <FieldLabel key={tier.id} htmlFor={`tier-${tier.id}`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>
                    {tier.domains} sites
                    {isCurrent ? <Badge variant="secondary">Current</Badge> : null}
                  </FieldTitle>
                  <FieldDescription>
                    <span className="font-medium text-foreground">
                      ${value.billing === 'annual' ? tier.annual : tier.monthly}
                    </span>{' '}
                    a {value.billing === 'annual' ? 'year' : 'month'}
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem value={String(tier.domains)} id={`tier-${tier.id}`} />
              </Field>
            </FieldLabel>
          )
        })}
      </RadioGroup>
    </div>
  )
}
