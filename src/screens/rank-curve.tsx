import * as Plot from "@observablehq/plot"
import { PlotFigure } from "@/blocks/plot-figure"
import type { RankCurve } from "@/lib/program"

export function AuditCurve({
  curve,
  metric,
  coordinate,
}: {
  curve: RankCurve
  metric: "precision" | "recall"
  coordinate: string
}) {
  const band = curve[metric]
  const title = metric === "precision" ? "Precision by rank" : "Recall by rank"
  const index = curve.rank.findIndex((r) => `Rank ${r.toLocaleString("en-US")}` === coordinate)
  return (
    <section aria-label={title}>
      <strong>{title}</strong>
      <PlotFigure
        height={150}
        build={(t) => ({
          marginLeft: 39,
          marginRight: 18,
          marginTop: 9,
          marginBottom: 32,
          x: { label: "Rank cutoff", ticks: 4, tickFormat: "~s" },
          y: { label: null, ticks: 3, tickFormat: ".0%", grid: true, domain: [0, 1] },
          marks: [
            Plot.areaY(curve.rank, {
              x: (r) => r,
              y1: (_, i) => band.lower[i],
              y2: (_, i) => band.upper[i],
              fill: t.series[0],
              fillOpacity: 0.22,
            }),
            Plot.lineY(curve.rank, {
              x: (r) => r,
              y: (_, i) => band.estimate[i],
              stroke: t.series[0],
            }),
            ...(index >= 0
              ? [
                  Plot.ruleX([curve.rank[index]], { stroke: t.axis, strokeDasharray: "3,2" }),
                  Plot.dot([index], {
                    x: (i) => curve.rank[i],
                    y: (i) => band.estimate[i],
                    fill: t.series[0],
                    r: 3,
                  }),
                ]
              : []),
          ],
        })}
      />
      <p>
        Median and {Math.round(curve.mass * 100)}% pointwise credible interval at{" "}
        {curve.rank.length} stored tie endpoints.
      </p>
    </section>
  )
}
