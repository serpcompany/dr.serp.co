'use client'

import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIsMobile } from '@/hooks/use-mobile'

// dashboard-01's ChartAreaInteractive, charting the average DR of the claimed sites.
const chartConfig = {
  average: {
    label: 'Average DR',
    color: 'var(--primary)'
  }
} satisfies ChartConfig

export function DrChart({ data }: { data: { date: string; average: number }[] }) {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState('365d')

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange('90d')
    }
  }, [isMobile])

  const latest = data.at(-1)?.date ?? new Date().toISOString().slice(0, 10)
  const filteredData = data.filter(item => {
    const date = new Date(item.date)
    const referenceDate = new Date(latest)
    let daysToSubtract = 365
    if (timeRange === '180d') {
      daysToSubtract = 180
    } else if (timeRange === '90d') {
      daysToSubtract = 90
    }
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Average DR</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Your claimed sites, at the end of each week
          </span>
          <span className="@[540px]/card:hidden">Weekly checks</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            multiple={false}
            value={timeRange ? [timeRange] : []}
            onValueChange={value => {
              setTimeRange(value[0] ?? '365d')
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="365d">Last year</ToggleGroupItem>
            <ToggleGroupItem value="180d">Last 6 months</ToggleGroupItem>
            <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
          </ToggleGroup>
          <Select
            items={[
              { label: 'Last year', value: '365d' },
              { label: 'Last 6 months', value: '180d' },
              { label: 'Last 3 months', value: '90d' }
            ]}
            value={timeRange}
            onValueChange={value => {
              if (value !== null) {
                setTimeRange(value)
              }
            }}
          >
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last year" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="365d" className="rounded-lg">
                Last year
              </SelectItem>
              <SelectItem value="180d" className="rounded-lg">
                Last 6 months
              </SelectItem>
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filteredData} margin={{ left: 0, right: 0 }}>
            <defs>
              <linearGradient id="fillAverage" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-average)" stopOpacity={1.0} />
                <stop offset="95%" stopColor="var(--color-average)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <YAxis hide domain={['dataMin - 4', 'dataMax + 2']} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={value => {
                const date = new Date(value)
                return date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={value => {
                    return new Date(value).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="average"
              type="natural"
              fill="url(#fillAverage)"
              stroke="var(--color-average)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
