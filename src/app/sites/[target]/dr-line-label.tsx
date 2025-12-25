"use client"

import { CartesianGrid, LabelList, Line, LineChart, XAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

type Point = { checkedAt: string; domainRating: number }

const chartConfig = {
  desktop: {
    label: "DR",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function DrLineLabel({ points }: { points: Point[] }) {
  const chartData = points
    .filter((p) => Number.isFinite(p.domainRating))
    .map((p) => ({
      month: new Date(p.checkedAt).toLocaleDateString("en-US", { month: "short" }),
      desktop: Math.max(0, Math.min(100, Math.floor(p.domainRating))),
    }))
    .slice(-12)

  return (
    <Card>
      <CardHeader>
        <CardTitle>DR over time</CardTitle>
        <CardDescription>Recent checks</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checks yet. Click “Recheck DR” to add the first point.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[125px] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                top: 20,
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => String(value).slice(0, 3)}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Line
                dataKey="desktop"
                type="natural"
                stroke="var(--color-desktop)"
                strokeWidth={2}
                dot={{
                  fill: "var(--color-desktop)",
                }}
                activeDot={{
                  r: 6,
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
