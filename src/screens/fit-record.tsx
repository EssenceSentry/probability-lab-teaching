import * as Plot from "@observablehq/plot"
import { useState } from "react"
import { labelWidth, PlotFigure } from "@/blocks/plot-figure"
import { fmt, type Run } from "@/lib/program"
export function FitRecord({ fit }: { fit: NonNullable<Run["fit"]> }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="archive-fit" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>How the full program was fitted</summary>
      <strong>{fit.method}</strong>
      <span>Forecast origin {fit.origin}</span>
      <p>{fit.note}</p>
      {open && fit.loss && (
        <PlotFigure
          height={116}
          build={(t) => ({
            marginLeft: labelWidth(t, ["−100k"]) + 10,
            marginRight: 14,
            marginBottom: 31,
            marginTop: 9,
            x: { label: null, ticks: 4 },
            y: { label: null, ticks: 3, tickFormat: "~s", grid: true },
            marks: [Plot.lineY(fit.loss, { x: (_, i) => (i + 1) * 50, stroke: t.series[0] })],
          })}
        />
      )}
      <dl>
        {Object.entries(fit.metrics).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{fmt(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
