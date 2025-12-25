"use client"

import { useMemo } from "react"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

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
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={8} minTickGap={24} />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            tickMargin={8}
            width={30}
          />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            labelStyle={{ fontSize: 12 }}
            formatter={(value) => [`${value}`, "DR"]}
          />
          <Line type="monotone" dataKey="dr" stroke="currentColor" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

