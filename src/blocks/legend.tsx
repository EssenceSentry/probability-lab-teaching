import { cn } from "@/lib/utils"

export type LegendItem = {
  label: string
  /** A colour token, such as `var(--series-1)` or `var(--viz-text)`. */
  colour: string
  /** Match the chart's mark: dots for points, lines for lines, squares for bars. */
  mark?: "dot" | "line" | "square"
}

/** The key for one mark of a chart. */
export function LegendMark({ colour, mark = "dot" }: Omit<LegendItem, "label">) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0",
        mark === "dot" && "size-2 rounded-full",
        mark === "line" && "h-0.5 w-3.5 rounded",
        mark === "square" && "size-2.5 rounded-[3px]"
      )}
      style={{ background: colour }}
    />
  )
}

/**
 * A chart's key, for any chart with two or more series. Put it in the chart's
 * SectionHeader `meta` so it sits on the title's baseline.
 */
export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
          <LegendMark colour={item.colour} mark={item.mark} />
          {item.label}
        </span>
      ))}
    </span>
  )
}
