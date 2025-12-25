"use client"

import { TrendingUp } from "lucide-react"
import { CartesianGrid, LabelList, Line, LineChart, XAxis } from "recharts"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
          <ChartContainer config={chartConfig}>
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
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Tracking changes <TrendingUp className="h-4 w-4" />
        </div>
        <div className="text-muted-foreground leading-none">Recheck DR to add more data points.</div>
      </CardFooter>
    </Card>
  )
}
