import { Graph, layout } from "@dagrejs/dagre"

export interface LayoutNode {
  id: string
  width: number
  height: number
  parents: readonly string[]
}
interface Point {
  x: number
  y: number
}
interface Box extends Point {
  width: number
  height: number
}
interface Wire {
  parent: string
  child: string
  points: Point[]
}
export interface Scene {
  positions: Map<string, Box>
  edges: Wire[]
  w: number
  h: number
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const gap = 40

interface Band {
  x: number
  left: number
  right: number
  boxes: Box[]
}

function clearLane(band: Band, preferred: number) {
  for (const b of band.boxes) {
    const top = b.y - b.height / 2 - 5,
      bottom = b.y + b.height / 2 + 5
    if (preferred < top) break
    if (preferred <= bottom) return preferred - top < bottom - preferred ? top : bottom
  }
  return preferred
}

// Clip the segment to the box’s horizontal extent and test its vertical range.
function touchesBox(a: Point, b: Point, box: Box) {
  const left = Math.max(a.x, box.x - box.width / 2 - 2),
    right = Math.min(b.x, box.x + box.width / 2 + 2)
  if (left > right) return false
  const slope = b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x)
  const y1 = a.y + (left - a.x) * slope,
    y2 = b.x === a.x ? b.y : a.y + (right - a.x) * slope
  return (
    Math.max(y1, y2) >= box.y - box.height / 2 - 2 && Math.min(y1, y2) <= box.y + box.height / 2 + 2
  )
}

// A rank occupies a vertical band. Edges traverse each intermediate band
// at a free ordinate and change height in the empty gap between bands.
function route(positions: Map<string, Box>, edges: Wire[]) {
  const byX = new Map<number, Band>()
  for (const box of positions.values()) {
    const band = byX.get(box.x) ?? { x: box.x, left: Infinity, right: -Infinity, boxes: [] }
    band.left = Math.min(band.left, box.x - box.width / 2)
    band.right = Math.max(band.right, box.x + box.width / 2)
    band.boxes.push(box)
    byX.set(box.x, band)
  }
  const bands = [...byX.values()].sort((a, b) => a.x - b.x)
  for (const band of bands) band.boxes.sort((a, b) => a.y - b.y)
  const rank = new Map(bands.map((b, i) => [b.x, i]))
  function ports(start: boolean) {
    const groups = new Map<string, Wire[]>(),
      result = new Map<Wire, number>()
    for (const e of edges) {
      const id = start ? e.parent : e.child,
        group = groups.get(id) ?? []
      group.push(e)
      groups.set(id, group)
    }
    for (const [id, group] of groups) {
      const box = positions.get(id)!
      const opposite = (e: Wire) => (start ? e.child : e.parent)
      group.sort(
        (a, b) =>
          positions.get(opposite(a))!.y - positions.get(opposite(b))!.y ||
          byId(opposite(a), opposite(b))
      )
      const step = Math.min(10, Math.max(0, box.height - 10) / Math.max(1, group.length - 1))
      group.forEach((e, i) => {
        result.set(e, box.y + (i - (group.length - 1) / 2) * step)
      })
    }
    return result
  }
  const starts = ports(true),
    ends = ports(false)
  for (const e of edges) {
    const source = positions.get(e.parent)!,
      target = positions.get(e.child)!
    const a = rank.get(source.x)!,
      b = rank.get(target.x)!
    // Retain Dagre's short diagonal when both adjacent columns are clear.
    if (
      b === a + 1 &&
      e.points.every(
        (p, i) =>
          i === 0 ||
          ![bands[a], bands[b]].some((band) =>
            band.boxes.some(
              (box) => box !== source && box !== target && touchesBox(e.points[i - 1], p, box)
            )
          )
      )
    )
      continue
    const sy = starts.get(e)!,
      ty = ends.get(e)!
    const points: Point[] = [
      { x: source.x + source.width / 2, y: sy },
      { x: bands[a].right + 6, y: sy },
    ]
    let segment = 1
    for (let i = a + 1; i < b; i++) {
      const band = bands[i]
      while (segment < e.points.length - 1 && e.points[segment].x < band.x) segment++
      const prev = e.points[segment - 1],
        next = e.points[segment]
      const fraction = (band.x - prev.x) / (next.x - prev.x || 1)
      const y = clearLane(band, prev.y + (next.y - prev.y) * fraction)
      points.push({ x: band.left - 6, y }, { x: band.right + 6, y })
    }
    points.push({ x: bands[b].left - 6, y: ty }, { x: target.x - target.width / 2, y: ty })
    e.points = points.filter(
      (p, i) => !i || i === points.length - 1 || points[i - 1].y !== p.y || p.y !== points[i + 1].y
    )
  }
}

function layered(nodes: LayoutNode[], constraints: [string, string][], dense: boolean): Scene {
  const graph = new Graph()
    .setGraph({
      rankdir: "LR",
      ranksep: 64,
      nodesep: 16,
      edgesep: 10,
      ranker: dense ? "longest-path" : "network-simplex",
    })
    .setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height })
  const edges: Wire[] = []
  for (const node of nodes)
    for (const parent of node.parents) {
      graph.setEdge(parent, node.id)
      edges.push({ parent, child: node.id, points: [] })
    }
  // Constraints separate wide sibling groups into columns. They never become
  // program dependencies or visible wires.
  for (const [left, right] of constraints) graph.setEdge(left, right, { weight: 0.1 })
  layout(graph)
  for (const edge of edges) edge.points = graph.edge(edge.parent, edge.child).points
  const positions = new Map(nodes.map((n) => [n.id, graph.node(n.id)]))
  route(positions, edges)
  return {
    positions,
    edges,
    w: graph.graph().width,
    h: graph.graph().height,
  }
}

function foldConstraints(groups: LayoutNode[][], base: Scene, columns: number) {
  const constraints: [string, string][] = []
  for (const group of groups) {
    if (group.length < 4) continue
    const ordered = [...group].sort(
      (a, b) => base.positions.get(a.id)!.y - base.positions.get(b.id)!.y || byId(a.id, b.id)
    )
    const rows = Math.ceil(ordered.length / columns)
    for (let i = rows; i < ordered.length; i++)
      constraints.push([ordered[i - rows].id, ordered[i].id])
  }
  return constraints
}

function crosses(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
}

// Favor local routes, with extra weight on the edges a reader must follow farthest.
function cost(scene: Scene, countCrossings = true) {
  const lengths: number[] = []
  let total = 0,
    crossings = 0
  const segments: { a: Point; b: Point; wire: Wire }[] = []
  for (const wire of scene.edges) {
    let length = 0
    for (let i = 1; i < wire.points.length; i++) {
      const a = wire.points[i - 1],
        b = wire.points[i]
      if (countCrossings) segments.push({ a, b, wire })
      length += Math.hypot(b.x - a.x, b.y - a.y)
    }
    lengths.push(length)
    total += length
  }
  segments.sort((s, t) => s.a.x - t.a.x)
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    for (let j = i + 1; j < segments.length && segments[j].a.x < s.b.x; j++) {
      const t = segments[j]
      if (
        s.wire.parent !== t.wire.parent &&
        s.wire.child !== t.wire.child &&
        crosses(s.a, s.b, t.a, t.b)
      )
        crossings++
    }
  }
  lengths.sort((a, b) => a - b)
  const n = lengths.length
  return (
    (total + 240 * crossings) / n +
    0.55 * lengths[Math.ceil(0.9 * n) - 1] +
    0.3 * lengths[n - 1] +
    0.04 * Math.max(scene.w, scene.h)
  )
}

function componentLayout(nodes: LayoutNode[], children: Map<string, string[]>) {
  if (nodes.length === 1) {
    const { id, width, height } = nodes[0]
    return {
      w: width,
      h: height,
      positions: new Map([[id, { x: width / 2, y: height / 2, width, height }]]),
      edges: [],
    }
  }
  const edgeCount = nodes.reduce((sum, n) => sum + n.parents.length, 0)
  // Bound the candidate search for large imports; components remain independent.
  const dense = nodes.length > 120 || edgeCount > 240
  const base = layered(nodes, [], dense)
  const byKey = new Map(nodes.map((n) => [n.id, n]))
  const groups = new Map<string, LayoutNode[]>()
  for (const node of nodes) {
    const signature = JSON.stringify([node.parents, children.get(node.id)])
    const siblings = groups.get(signature) ?? []
    siblings.push(node)
    groups.set(signature, siblings)
  }
  const fans = [...groups.values()].filter((group) => group.length >= 4)
  if (dense) {
    if (!fans.length) return base
    const columns = Math.ceil(Math.sqrt(Math.max(...fans.map((group) => group.length))))
    const folded = layered(nodes, foldConstraints(fans, base, columns), true)
    return cost(folded, false) < cost(base, false) ? folded : base
  }
  // Try a sink-by-sink traversal too, so ordering follows each output's upstream branch.
  const ordered: LayoutNode[] = [],
    seen = new Set<string>()
  function visit(node: LayoutNode) {
    if (seen.has(node.id)) return
    seen.add(node.id)
    for (const parent of node.parents) visit(byKey.get(parent)!)
    ordered.push(node)
  }
  for (const node of nodes) if (!children.get(node.id)!.length) visit(node)
  let best = base,
    bestCost = cost(base)
  function consider(candidate: Scene) {
    const score = cost(candidate)
    if (score < bestCost) {
      best = candidate
      bestCost = score
    }
  }
  consider(layered(ordered, [], false))
  if (fans.length) {
    const widest = Math.max(...fans.map((group) => group.length))
    for (const columns of new Set([2, Math.ceil(Math.sqrt(widest)), Math.min(4, widest)])) {
      consider(layered(ordered, foldConstraints(fans, base, columns), false))
    }
  }
  return best
}

/** Deterministic layout of a validated DAG, using only its edges and box sizes. */
export function layoutGraph(input: readonly LayoutNode[]): Scene {
  const nodes = input
    .map((n) => ({ ...n, parents: [...new Set(n.parents)].sort(byId) }))
    .sort((a, b) => byId(a.id, b.id))
  const byKey = new Map(nodes.map((n) => [n.id, n]))
  const children = new Map(nodes.map((n) => [n.id, [] as string[]]))
  for (const n of nodes) for (const parent of n.parents) children.get(parent)!.push(n.id)
  const scenes: Scene[] = [],
    seen = new Set<string>()
  for (const start of nodes) {
    if (seen.has(start.id)) continue
    const group: LayoutNode[] = [],
      queue = [start.id]
    seen.add(start.id)
    for (let i = 0; i < queue.length; i++) {
      const n = byKey.get(queue[i])!
      group.push(n)
      for (const id of [...n.parents, ...children.get(n.id)!])
        if (!seen.has(id)) {
          seen.add(id)
          queue.push(id)
        }
    }
    scenes.push(componentLayout(group, children))
  }
  // Pack disconnected components as intact rectangles instead of one long row.
  scenes.sort((a, b) => b.h - a.h || b.w - a.w)
  const area = scenes.reduce((a, s) => a + (s.w + gap) * (s.h + gap), 0)
  const shelf = Math.max(Math.sqrt(area * 1.5), ...scenes.map((s) => s.w))
  const result: Scene = { w: 0, h: 0, positions: new Map(), edges: [] }
  let x = 0,
    y = 0,
    rowHeight = 0
  for (const scene of scenes) {
    if (x && x + scene.w > shelf) {
      x = 0
      y += rowHeight + gap
      rowHeight = 0
    }
    const dx = x + 24,
      dy = y + 24
    for (const [id, box] of scene.positions)
      result.positions.set(id, { ...box, x: box.x + dx, y: box.y + dy })
    for (const e of scene.edges)
      result.edges.push({ ...e, points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) })
    result.w = Math.max(result.w, x + scene.w + 48)
    result.h = Math.max(result.h, y + scene.h + 48)
    rowHeight = Math.max(rowHeight, scene.h)
    x += scene.w + gap
  }
  return result
}
