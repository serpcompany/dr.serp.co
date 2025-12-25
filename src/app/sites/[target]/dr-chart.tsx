"use client"

import { useMemo } from "react"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

export function DrChart({
  points,
}: {
  points: Array<{ checkedAt: string; domainRating: number }>
}) {
  const data = useMemo(() => {
    return points
      .filter((p) => Number.isFinite(p.domainRating))
      .map((p) => ({
        date: new Date(p.checkedAt).toISOString().slice(0, 10),
        dr: p.domainRating,
      }))
  }, [points])

  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough history yet.</p>
  }

  return (
    <ChartContainer
      className="h-56 w-full"
      config={{
        dr: { label: "DR", color: "#10a64a" },
      }}
    >
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={8} minTickGap={24} />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            tickMargin={8}
            width={30}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Line
            type="monotone"
            dataKey="dr"
            stroke="var(--color-dr)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
    </ChartContainer>
  )
}
