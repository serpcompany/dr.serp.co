'use client'

import { CartesianGrid, LabelList, Line, LineChart, XAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart'

type Point = { checkedAt: string; domainRating: number }

const chartConfig = {
  desktop: {
    label: 'DR',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig

export function DrLineLabel({ points }: { points: Point[] }) {
  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

  const chartData = points
    .map(p => {
      const domainRating = Number(p.domainRating)
      if (!Number.isFinite(domainRating)) return null

      const date = new Date(p.checkedAt)
      const ts = date.getTime()
      if (!Number.isFinite(ts)) return null

      return {
        ts,
        label: dateFormatter.format(date),
        desktop: Math.max(0, Math.min(100, Math.floor(domainRating)))
      }
    })
    .filter(p => p !== null)
    .sort((a, b) => a.ts - b.ts)
    .slice(-24)

  return (
    <Card>
      <CardHeader>
        <CardTitle>DR over time</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No checks yet. Reload this page later to look up its DR.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[125px] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 20,
                left: 12,
                right: 12
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={value => String(value)}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Line
                dataKey="desktop"
                type="natural"
                stroke="var(--color-desktop)"
                strokeWidth={2}
                dot={{
                  fill: 'var(--color-desktop)'
                }}
                activeDot={{
                  r: 6
                }}
              >
                <LabelList position="top" offset={12} className="fill-foreground" fontSize={12} />
              </Line>
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
