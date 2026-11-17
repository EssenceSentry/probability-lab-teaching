import type { VizTokens } from "@atelier/theme/viz"
import * as Plot from "@observablehq/plot"
import { useEffect, useRef, useState } from "react"

import { useVizTokens } from "@/blocks/use-viz-tokens"
import { cn } from "@/lib/utils"

type Build = (t: VizTokens, width: number) => Plot.PlotOptions

let measurer: CanvasRenderingContext2D | null | undefined

/**
 * Width in pixels of chart text set in the direction's label font. Set
 * margins from it rather than by hand: label fonts differ in width between
 * directions and machines, and a hand-set margin that fits one clips another.
 */
export function labelWidth(
  t: VizTokens,
  texts: string[],
  { size = 11, weight = 400 }: { size?: number; weight?: number } = {}
) {
  measurer ??= document.createElement("canvas").getContext("2d")
  if (!measurer) return 8 * Math.max(0, ...texts.map((text) => text.length))
  measurer.font = `${weight} ${size}px ${t.labelFont}`
  return Math.ceil(Math.max(0, ...texts.map((text) => measurer?.measureText(text).width ?? 0)))
}

/** Shared axis and type styling so every chart recedes the same way. */
export function baseOptions(t: VizTokens, width: number): Plot.PlotOptions {
  return {
    width,
    style: {
      background: "transparent",
      color: t.text,
      fontFamily: t.labelFont,
      fontSize: "11px",
      overflow: "visible",
    },
  }
}

/**
 * Marks that only fit a wide chart, such as notes beside the data. Narrow
 * charts drop them, because there they land on the marks or on each other.
 */
export const NARROW_CHART = 560
export const whenWide = (width: number, marks: Plot.Markish[], min = NARROW_CHART) =>
  width < min ? [] : marks

/** Tooltip styled from the direction's popover tokens. */
export const tipStyle = (t: VizTokens) => ({
  fill: t.popover,
  stroke: t.border,
  textPadding: 8,
  fontSize: 11,
})

export function PlotFigure({
  build,
  height,
  fill = false,
  narrowNote,
  className,
}: {
  build: Build
  /** Chart height in pixels; with `fill`, the minimum height. */
  height: number
  /** Grow to the height the parent flex column gives the figure. */
  fill?: boolean
  /**
   * What the notes say that `whenWide` drops on narrow charts, shown as a
   * caption under the chart there so the explanation is not lost.
   */
  narrowNote?: string
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const tokens = useVizTokens()
  const [size, setSize] = useState({ width: 0, height: 0 })
  // Redraw once web fonts arrive, so margins measured from labels fit them.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure once up front: ResizeObserver waits for a rendered frame, which
    // background tabs and headless captures may never produce.
    const box = el.getBoundingClientRect()
    setSize({ width: Math.floor(box.width), height: Math.floor(box.height) })
    const ro = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const chartHeight = fill ? Math.max(height, size.height) : height

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontsReady redraws once web fonts load
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // data-state lets screenshot QA tell a slow chart from a broken one.
    if (!tokens || size.width === 0) {
      el.dataset.state = tokens ? "no-width" : "no-tokens"
      return
    }
    let chart: ReturnType<typeof Plot.plot>
    try {
      chart = Plot.plot({
        ...baseOptions(tokens, size.width),
        height: chartHeight,
        ...build(tokens, size.width),
      })
    } catch (error) {
      const message = (error as Error).message
      el.dataset.state = `error: ${message}`
      console.error("chart failed", error)
      const note = document.createElement("p")
      note.className = "flex h-full items-center justify-center text-xs text-muted-foreground"
      note.textContent = `Chart failed: ${message}`
      el.replaceChildren(note)
      return
    }
    el.dataset.state = "ok"
    el.replaceChildren(chart)
    return () => chart.remove()
  }, [tokens, size.width, chartHeight, build, fontsReady])

  const figure = (
    <figure
      ref={ref}
      className={cn("plot-figure m-0 w-full", fill && "min-h-0 flex-1", className)}
      style={fill ? { minHeight: height } : { height }}
    />
  )
  if (!narrowNote || size.width === 0 || size.width >= NARROW_CHART) return figure
  return (
    <>
      {figure}
      <p className="text-xs text-muted-foreground">{narrowNote}</p>
    </>
  )
}
