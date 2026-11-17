import { memo } from "react"
import { expressionLines } from "@/lib/expression-lines"

// Canvas cards have a fixed world-space width, independent of pan and zoom.
export const Expression = memo(function Expression({
  source,
  className,
  columns = 35,
}: {
  source: string
  className: string
  columns?: number
}) {
  const lines = expressionLines(source, columns)
  return (
    <code className={className}>
      {lines.map((line) => (
        <span
          className="expression-line"
          key={line.start}
          style={line.indent ? { paddingInlineStart: `${line.indent}ch` } : undefined}
        >
          {line.text}
        </span>
      ))}
    </code>
  )
})
