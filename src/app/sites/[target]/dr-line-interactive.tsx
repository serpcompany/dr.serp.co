"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

type Point = { checkedAt: string; domainRating: number }

function movingAverage(values: number[], windowSize: number) {
  const result: number[] = []
  for (let index = 0; index < values.length; index += 1) {
    const start = Math.max(0, index - windowSize + 1)
    const slice = values.slice(start, index + 1)
    const avg = slice.reduce((acc, current) => acc + current, 0) / slice.length
    result.push(avg)
  }
  return result
}

export function DrLineInteractive({ points }: { points: Point[] }) {
  const chartData = React.useMemo(() => {
    const filtered = points
      .filter((p) => Number.isFinite(p.domainRating))
      .map((p) => ({
        date: new Date(p.checkedAt).toISOString().slice(0, 10),
        desktop: Math.max(0, Math.min(100, Math.floor(p.domainRating))),
      }))

    const drValues = filtered.map((row) => row.desktop)
    const avgValues = movingAverage(drValues, 7).map((v) => Math.round(v * 10) / 10)

    return filtered.map((row, index) => ({
      date: row.date,
      desktop: row.desktop,
      mobile: avgValues[index] ?? row.desktop,
    }))
  }, [points])

  const chartConfig = {
    views: {
      label: "Domain Rating",
    },
    desktop: {
      label: "DR",
      color: "var(--chart-2)",
    },
    mobile: {
      label: "7d avg",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig

  const [activeChart, setActiveChart] =
    React.useState<keyof typeof chartConfig>("desktop")

  const totals = React.useMemo(
    () => ({
      desktop: chartData.length ? chartData[chartData.length - 1].desktop : 0,
      mobile: chartData.length ? chartData[chartData.length - 1].mobile : 0,
    }),
    [chartData]
  )

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
          <CardTitle>DR over time</CardTitle>
          <CardDescription>Showing recent checks for this domain</CardDescription>
        </div>
        <div className="flex">
          {(["desktop", "mobile"] as const).map((key) => {
            const chart = key as keyof typeof chartConfig
            return (
              <button
                key={chart}
                data-active={activeChart === chart}
                className="data-[active=true]:bg-muted/50 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
                onClick={() => setActiveChart(chart)}
              >
                <span className="text-muted-foreground text-xs">{chartConfig[chart].label}</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">
                  {typeof totals[key] === "number" ? totals[key].toLocaleString() : "—"}
                </span>
              </button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {chartData.length < 2 ? (
          <p className="text-sm text-muted-foreground px-4 py-10">Not enough history yet.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[150px]"
                    nameKey="views"
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    }}
                  />
                }
              />
              <Line
                dataKey={activeChart}
                type="monotone"
                stroke={`var(--color-${activeChart})`}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
