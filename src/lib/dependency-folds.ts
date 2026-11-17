import type { Site } from "./program"
import { inputsOf } from "./trace"

export function dependencies(sites: Site[]) {
  const parents = new Map(sites.map((s) => [s.id, inputsOf(s)]))
  const children = new Map(sites.map((s) => [s.id, [] as string[]]))
  for (const [id, inputs] of parents) for (const input of inputs) children.get(input)!.push(id)
  return {
    parents,
    children,
    outputs: sites.filter((s) => !children.get(s.id)!.length).map((s) => s.id),
  }
}
type Dependencies = ReturnType<typeof dependencies>

// Begin at every original output, including isolated cards. A shared input
// remains whenever any open consumer can still reach it.
export function visibleDependencies(graph: Dependencies, folded: ReadonlySet<string>) {
  const visible = new Set<string>(),
    stack = [...graph.outputs]
  while (stack.length) {
    const id = stack.pop()!
    if (visible.has(id)) continue
    visible.add(id)
    if (!folded.has(id)) stack.push(...graph.parents.get(id)!)
  }
  return visible
}

// The locator can still navigate to a tucked-away variable. Unfold only a
// shortest path to a visible consumer, leaving unrelated branches as arranged.
export function revealDependency(
  id: string,
  graph: Dependencies,
  visible: ReadonlySet<string>,
  folded: ReadonlySet<string>
) {
  const queue = [id],
    previous = new Map<string, string | null>([[id, null]])
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    if (visible.has(current)) {
      const next = new Set(folded)
      let step = current
      while (step !== id) {
        next.delete(step)
        step = previous.get(step)!
      }
      return next
    }
    for (const child of graph.children.get(current)!)
      if (!previous.has(child)) {
        previous.set(child, current)
        queue.push(child)
      }
  }
  return new Set(folded)
}
