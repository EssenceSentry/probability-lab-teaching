import type { VizTokens } from "@atelier/theme/viz"
import * as Plot from "@observablehq/plot"
import { useCallback, useMemo } from "react"
import { labelWidth, PlotFigure } from "@/blocks/plot-figure"
import { fmt } from "@/lib/program"
import { type Curve, distributionBins } from "@/lib/trace"

export function TracePlot({
  values,
  visible,
  curve,
  marker,
  observed = false,
  weights,
  reference,
  discrete = false,
  large = false,
}: {
  values: number[]
  visible: number
  curve?: Curve
  marker?: number
  observed?: boolean
  discrete?: boolean
  reference?: number[]
  weights?: Float64Array
  large?: boolean
}) {
  const bins = useMemo(
    () => distributionBins(values, curve, marker, weights, visible, reference, discrete),
    [values, curve, marker, weights, visible, reference, discrete]
  )
  const build = useCallback(
    (t: VizTokens, w: number): Plot.PlotOptions => ({
      marginLeft: large ? labelWidth(t, ["100%"]) + 8 : 8,
      marginRight: large ? 14 : 8,
      marginTop: 5,
      marginBottom: large ? 23 : 5,
      x: {
        axis: large ? "bottom" : null,
        label: null,
        ticks: w < 340 ? 3 : 5,
        tickFormat: (v) => fmt(Number(v)),
        domain: [bins[0].lo, bins[bins.length - 1].hi],
      },
      y: {
        axis: large ? "left" : null,
        label: null,
        tickFormat: "%",
        ticks: 3,
        grid: large,
        domain: [
          0,
          Math.max(
            0.01,
            ...bins.map((b) => Math.max(b.theory, b.fullEmpirical, b.fullWeighted, b.reference))
          ) * 1.06,
        ],
      },
      marks: [
        Plot.rectY(bins, {
          x1: "lo",
          x2: "hi",
          y: "empirical",
          ariaLabel: () =>
            reference ? "Posterior draws" : observed ? "Observed measurements" : "Simulated draws",
          fill: observed ? t.series[1] : t.series[0],
          fillOpacity: 0.4,
          insetLeft: 0.3,
          insetRight: 0.3,
        }),
        ...(reference
          ? [
              Plot.line(bins, {
                ariaLabel: () => "Prior draws",
                x: "mid",
                y: "reference",
                stroke: t.series[2],
                strokeWidth: 2,
                strokeDasharray: "4 2",
              }),
            ]
          : []),
        ...(curve
          ? curve.discrete
            ? [Plot.dot(bins, { x: "mid", y: "theory", r: 2, fill: t.ink })]
            : [Plot.line(bins, { x: "mid", y: "theory", stroke: t.ink, strokeWidth: 1.6 })]
          : []),
        ...(weights
          ? [Plot.line(bins, { x: "mid", y: "weighted", stroke: t.series[2], strokeWidth: 2.1 })]
          : []),
        ...(marker === undefined
          ? []
          : [
              Plot.ruleX([marker], {
                ariaLabel: () => (observed ? "Observed value" : "Simulated value"),
                stroke: observed ? t.series[1] : t.primary,
                strokeWidth: observed ? 2 : 1,
                strokeDasharray: observed ? undefined : "3 2",
              }),
            ]),
        Plot.ruleY([0], { stroke: t.axis }),
      ],
    }),
    [bins, curve, large, marker, observed, weights, reference]
  )
  return <PlotFigure height={large ? 160 : 57} build={build} />
}
