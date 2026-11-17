import ELK, { type ElkNode, type ElkPort } from "elkjs/lib/elk.bundled.js"
import type { LayoutNode, Scene } from "./graph-layout"

const engine = new ELK()
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// The bundled worker can write geometry into its input. Isolate candidate
// layouts so rejected bends cannot leak into a subsequent routing pass.
const solve = (graph: ElkNode) => engine.layout<ElkNode>(structuredClone(graph))

/** Use a separate west or east port for every directed dependency. */
export async function hierarchicalLayout(input: readonly LayoutNode[]): Promise<Scene> {
  const nodes = [...input].sort((a, b) => compare(a.id, b.id))
  const children: ElkNode[] = nodes.map((n, i) => ({
    id: "n" + i,
    width: n.width,
    height: n.height,
    layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
    ports: [],
  }))
  const byId = new Map(nodes.map((n, i) => [n.id, children[i]]))
  const links: {
    id: string
    parent: string
    child: string
    sources: string[]
    targets: string[]
  }[] = []
  function port(node: ElkNode, id: string, side: string) {
    const p: ElkPort = { id, width: 0, height: 0, layoutOptions: { "elk.port.side": side } }
    node.ports?.push(p)
    return id
  }
  for (const n of nodes)
    for (const parent of [...new Set(n.parents)].sort(compare)) {
      const id = "e" + links.length
      links.push({
        id,
        parent,
        child: n.id,
        sources: [port(byId.get(parent)!, id + "s", "EAST")],
        targets: [port(byId.get(n.id)!, id + "t", "WEST")],
      })
    }
  const graph: ElkNode = {
    id: "root",
    children,
    edges: links.map(({ id, sources, targets }) => ({ id, sources, targets })),
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
      "elk.spacing.nodeNode": "20",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
      "elk.layered.spacing.edgeNodeBetweenLayers": "14",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.randomSeed": "1",
    },
  }
  let result = await solve(graph)
  // A tall layer of independent parents can make every label tiny at fit-to-view.
  // Let ELK split layers, but accept it only if the overall fit improves.
  const footprint = (g: ElkNode) => Math.max(g.width! / 1.6, g.height!)
  if (nodes.length >= 12 && result.height! > 1.15 * result.width!) {
    const split = await solve({
      ...graph,
      layoutOptions: {
        ...graph.layoutOptions,
        "elk.layered.layerUnzipping.strategy": "ALTERNATING",
      },
    })
    if (footprint(split) < footprint(result) * 0.92) {
      // Unzipping is a placement hint. Route again with those ranks so every
      // original edge gets a fresh orthogonal path around the moved boxes.
      const sketch = new Map(split.children?.map((n) => [n.id, n]))
      const rerouted = await solve({
        ...graph,
        children: children.map((n) => ({ ...n, x: sketch.get(n.id)?.x, y: sketch.get(n.id)?.y })),
        layoutOptions: { ...graph.layoutOptions, "elk.layered.layering.strategy": "INTERACTIVE" },
      })
      if (footprint(rerouted) < footprint(result) * 0.92) result = rerouted
    }
  }
  const positions: Scene["positions"] = new Map()
  for (const c of result.children ?? []) {
    const n = nodes[Number(c.id.slice(1))]
    positions.set(n.id, {
      x: c.x! + n.width / 2,
      y: c.y! + n.height / 2,
      width: n.width,
      height: n.height,
    })
  }
  const edges: Scene["edges"] = (result.edges ?? []).map((e) => {
    const { parent, child } = links[Number(e.id.slice(1))],
      section = e.sections?.[0]
    if (!section) throw new Error("Missing dependency route")
    return {
      parent,
      child,
      points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
    }
  })
  return { positions, edges, w: result.width ?? 0, h: result.height ?? 0 }
}
