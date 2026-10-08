'use client'

import {
  Label,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart
} from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type ChartConfig, ChartContainer } from '@/components/ui/chart'

export function DrRadialShape({ value }: { value: number | null }) {
  const safeValue =
    value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, Math.floor(value)))
  const chartData = [
    {
      dr: safeValue ?? 0,
      fill: 'var(--color-dr)'
    }
  ]

  const chartConfig = {
    dr: {
      label: 'DR',
      color: 'var(--chart-2)'
    }
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center">
        <CardTitle>Domain Rating</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
          <RadialBarChart
            data={chartData}
            startAngle={90}
            endAngle={-270}
            innerRadius={80}
            outerRadius={140}
          >
            <PolarAngleAxis dataKey="dr" type="number" domain={[0, 100]} tick={false} />
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
              polarRadius={[86, 74]}
            />
            <RadialBar dataKey="dr" background />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    const display = safeValue === null ? '—' : String(safeValue)
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-4xl font-bold"
                        >
                          {display}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
