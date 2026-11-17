import { Graph, layout } from "@dagrejs/dagre"
import {
  Activity,
  ArrowUpLeft,
  Box,
  Boxes,
  Braces,
  Database,
  Expand,
  Layers,
  Minus,
  Plus,
  ScanLine,
  SlidersHorizontal,
  Workflow,
} from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  fmt,
  getSeries,
  type Kind,
  kindNames,
  type Program,
  type Run,
  type Site,
} from "@/lib/program"
export const icons = {
  random: Activity,
  derived: Braces,
  observed: Database,
  input: Box,
  parameter: SlidersHorizontal,
  predictive: ScanLine,
  factor: SlidersHorizontal,
}
interface Tile {
  id: string
  name: string
  members: Site[]
  block: boolean
}
const W = 172,
  H = 67
function layoutMap(program: Program, mode: string) {
  const groups = new Map<string, Site[]>()
  for (const n of program.nodes) {
    const arr = groups.get(n.group) ?? []
    arr.push(n)
    groups.set(n.group, arr)
  }
  const tiles = new Map<string, Tile>(),
    edges = new Set<string>()
  const key = (n: Site) => (mode === "variables" || mode === n.group ? `n:${n.id}` : `g:${n.group}`)
  const byId = new Map(program.nodes.map((n) => [n.id, n]))
  for (const n of program.nodes) {
    const id = key(n)
    tiles.set(id, {
      id,
      name: id.startsWith("n:") ? n.name : n.group,
      members: id.startsWith("n:") ? [n] : (groups.get(n.group) ?? []),
      block: id.startsWith("g:"),
    })
    for (const parent of [...n.parents, ...(n.observedFrom ? [n.observedFrom] : [])]) {
      const p = byId.get(parent)
      if (p && key(p) !== id) edges.add(JSON.stringify([key(p), id]))
    }
  }
  const g = new Graph()
    .setGraph({ rankdir: "LR", nodesep: 12, ranksep: 64, marginx: 24, marginy: 24 })
    .setDefaultEdgeLabel(() => ({}))
  for (const t of tiles.values()) g.setNode(t.id, { width: W, height: H })
  for (const edge of edges) {
    const [a, b] = JSON.parse(edge)
    g.setEdge(a, b)
  }
  layout(g)
  const placed = [...tiles.values()].map((t) => ({
    ...t,
    x: g.node(t.id).x - W / 2,
    y: g.node(t.id).y - H / 2,
  }))
  const wires = g
    .edges()
    .map((e) => ({ from: e.v, to: e.w, points: g.edge(e).points as { x: number; y: number }[] }))
  return { tiles: placed, wires, w: g.graph().width ?? 600, h: g.graph().height ?? 350 }
}
export function ProgramMap({
  program,
  run,
  draw,
  site,
  onSelect,
  mode,
  onMode,
}: {
  program: Program
  run?: Run
  draw: number
  site: Site
  onSelect: (id: string) => void
  mode: string
  onMode: (m: string) => void
}) {
  const scene = useMemo(() => layoutMap(program, mode), [program, mode])
  const [zoom, setZoom] = useState(1),
    [size, setSize] = useState({ w: 750, h: 370 })
  const wrap = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const arrow = useId().replaceAll(":", "")
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const obs = new ResizeObserver(([s]) =>
      setSize({ w: s.contentRect.width, h: s.contentRect.height })
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const fit = Math.min(1.18, (size.w - 16) / scene.w, (size.h - 14) / scene.h)
  const scale = Math.max(size.w < 500 ? 0.78 : 0.64, fit) * zoom
  const selected = scene.tiles.find((t) => t.members.some((n) => n.id === site.id))?.id
  const chooseMode = (m: string) => {
    onMode(m)
    setZoom(1)
    wrap.current?.scrollTo(0, 0)
  }
  return (
    <section className="surface map-section">
      <div className="section-bar">
        <div className="section-title">
          <Workflow size={18} />
          <h2>Program map</h2>
        </div>
        <div className="seg">
          <button
            type="button"
            aria-pressed={mode === "blocks"}
            onClick={() => chooseMode("blocks")}
          >
            Blocks
          </button>
          <button
            type="button"
            aria-pressed={mode === "variables"}
            onClick={() => chooseMode("variables")}
          >
            Variables
          </button>
        </div>
      </div>
      <div
        className="canvas"
        ref={wrap}
        onPointerDown={(e) => {
          if (
            e.pointerType !== "mouse" ||
            e.button !== 0 ||
            (e.target as Element).closest("button")
          )
            return
          const el = e.currentTarget
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
          el.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) {
            e.currentTarget.scrollLeft = d.left + d.x - e.clientX
            e.currentTarget.scrollTop = d.top + d.y - e.clientY
          }
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        <div
          className="map-area"
          style={{
            width: Math.max(size.w, scene.w * scale),
            height: Math.max(size.h, scene.h * scale),
          }}
        >
          <div
            className="map-world"
            style={{
              width: scene.w,
              height: scene.h,
              transform: `scale(${scale})`,
              left: Math.max(0, (size.w - scene.w * scale) / 2),
              top: Math.max(0, (size.h - scene.h * scale) / 2),
            }}
          >
            <svg
              className="wires"
              width={scene.w}
              height={scene.h}
              role="img"
              aria-label="Directed program dependencies"
            >
              <defs>
                {["normal", "active"].map((k) => (
                  <marker
                    key={k}
                    id={arrow + k}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path
                      d="M 0 0 L 10 5 L 0 10 z"
                      fill={k === "active" ? "var(--primary)" : "var(--muted-foreground)"}
                    />
                  </marker>
                ))}
              </defs>
              {scene.wires.map((e) => {
                const active = e.from === selected || e.to === selected
                return (
                  <polyline
                    key={JSON.stringify([e.from, e.to])}
                    className={active ? "active" : ""}
                    points={e.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    markerEnd={`url(#${arrow}${active ? "active" : "normal"})`}
                  />
                )
              })}
            </svg>
            {scene.tiles.map((t, i) => {
              const current =
                t.members.find((n) => n.id === site.id) ??
                t.members.find((n) => n.kind === "derived") ??
                t.members[0]
              const Icon = t.block ? Layers : icons[current.kind]
              const val = getSeries(run, current.id).values
              return (
                <button
                  type="button"
                  key={t.id}
                  className={`tile ${selected === t.id ? "selected" : ""}`}
                  style={{ left: t.x, top: t.y, width: W, height: H }}
                  aria-label={(t.block ? "Explore block " : "Inspect ") + t.name}
                  aria-pressed={selected === t.id}
                  onClick={() => {
                    onSelect(current.id)
                    if (t.block) chooseMode(t.name)
                  }}
                >
                  <span className="tile-meta">
                    <Icon size={13} />
                    {t.block ? `BLOCK ${String(i + 1).padStart(2, "0")}` : kindNames[current.kind]}
                  </span>
                  <b>{t.name}</b>
                  <span className="tile-foot">
                    {t.block ? `${t.members.length} variables` : val ? fmt(val[draw]) : current.id}
                    {val ? (
                      <TraceMark values={val} draw={draw} label={current.name} />
                    ) : (
                      t.block && <Expand size={10} />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="map-footer">
        <span className="map-caption">
          {mode === "blocks" ? <Boxes size={15} /> : <ArrowUpLeft size={15} />}{" "}
          {mode === "blocks"
            ? "Select a block to open it"
            : mode === "variables"
              ? "Complete variable graph"
              : mode}
        </span>
        <div className="tools">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.4}
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            aria-label="Fit graph"
            onClick={() => {
              setZoom(Math.min(1, fit / Math.max(size.w < 500 ? 0.78 : 0.64, fit)))
              wrap.current?.scrollTo(0, 0)
            }}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}
function TraceMark({ values, draw, label }: { values: number[]; draw: number; label: string }) {
  const bins = useMemo(() => {
    const low = values.reduce((a, b) => Math.min(a, b), Infinity),
      high = values.reduce((a, b) => Math.max(a, b), -Infinity)
    const at = (x: number) =>
      high === low ? 7 : Math.min(14, Math.floor((15 * (x - low)) / (high - low)))
    const counts = Array<number>(15).fill(0)
    for (const x of values) counts[at(x)]++
    return { counts, max: Math.max(...counts), at }
  }, [values])
  const selected = bins.at(values[draw])
  return (
    <svg
      className="trace-mark"
      width="41"
      height="13"
      viewBox="0 0 45 14"
      role="img"
      aria-label={`${label} distribution; selected draw ${fmt(values[draw])}`}
    >
      <title>
        {label} · {fmt(values[draw])}
      </title>
      {bins.counts.map((n, i) => (
        <rect
          key={String(i)}
          x={i * 3}
          y={12 - (n / bins.max) * 10}
          width="2.6"
          height={(n / bins.max) * 10}
          fill="var(--series-1)"
        />
      ))}
      <path d={`M${selected * 3 + 1} 0v14`} stroke="var(--foreground)" strokeWidth="1.4" />
    </svg>
  )
}
export function KindTag({ kind }: { kind: Kind }) {
  const Icon = icons[kind]
  return (
    <span className={`kind-tag ${kind}`}>
      <Icon size={13} />
      {kindNames[kind]}
    </span>
  )
}
