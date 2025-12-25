"use client"

import { useMemo } from "react"
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

export function DrRadial({ value }: { value: number | null }) {
  const data = useMemo(() => {
    const safeValue = value === null ? 0 : Math.max(0, Math.min(100, Math.floor(value)))
    return [{ key: "dr", value: safeValue }]
  }, [value])

  return (
    <ChartContainer
      className="mx-auto aspect-square h-44"
      config={{
        dr: { label: "DR", color: "#10a64a" },
      }}
    >
      <RadialBarChart
        data={data}
        startAngle={90}
        endAngle={-270}
        innerRadius={72}
        outerRadius={98}
      >
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <PolarRadiusAxis tick={false} axisLine={false}>
          <Label
            content={({ viewBox }) => {
              const cx = viewBox && "cx" in viewBox ? (viewBox as any).cx : 0
              const cy = viewBox && "cy" in viewBox ? (viewBox as any).cy : 0
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan className="fill-foreground text-4xl font-semibold">
                    {value === null ? "—" : Math.round(value)}
                  </tspan>
                  <tspan x={cx} dy="1.6em" className="fill-muted-foreground text-xs">
                    DR
                  </tspan>
                </text>
              )
            }}
          />
        </PolarRadiusAxis>
        <RadialBar
          dataKey="value"
          cornerRadius={999}
          fill="var(--color-dr)"
          background
        />
      </RadialBarChart>
    </ChartContainer>
  )
}
