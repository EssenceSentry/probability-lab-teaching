import type { LayoutNode } from "./graph-layout"
import type { Site } from "./program"

/** A routing node shares one likelihood's parameter inputs across its two outputs. */
export function sharedLikelihoods(sites: Site[], cards: LayoutNode[], folded: ReadonlySet<string>) {
  const byId = new Map(sites.map((s) => [s.id, s]))
  const junctions = new Map<string, Site>()
  const parents = new Map<string, string[]>()
  const extra: LayoutNode[] = []
  for (const y of sites) {
    if (y.kind !== "observed" || folded.has(y.id)) continue
    const rep = byId.get(y.id + "__rep")
    if (!rep || rep.kind !== "predictive" || folded.has(rep.id) || rep.observedFrom) continue
    if (
      y.parents.length !== rep.parents.length ||
      !y.parents.every((id) => rep.parents.includes(id))
    )
      continue
    let id = "@likelihood/" + y.id
    while (byId.has(id) || junctions.has(id)) id += "_"
    junctions.set(id, y)
    extra.push({ id, width: 124, height: 30, parents: y.parents })
    parents.set(y.id, y.observedFrom ? [id, y.observedFrom] : [id])
    parents.set(rep.id, [id])
  }
  return {
    junctions,
    nodes: [
      ...cards.map((c) => (parents.has(c.id) ? { ...c, parents: parents.get(c.id)! } : c)),
      ...extra,
    ],
  }
}
