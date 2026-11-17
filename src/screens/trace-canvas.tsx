import {
  Ellipsis,
  LocateFixed,
  Maximize,
  Minus,
  PanelRightOpen,
  Play,
  Plus,
  SkipForward,
  X,
} from "lucide-react"
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Legend } from "@/blocks/legend"
import { canvasInset, useCanvasCamera } from "@/lib/canvas-camera"
import { dependencies, revealDependency, visibleDependencies } from "@/lib/dependency-folds"
import { type LayoutNode, layoutGraph, type Scene } from "@/lib/graph-layout"
import { hierarchicalLayout } from "@/lib/hierarchical-layout"
import { sharedLikelihoods } from "@/lib/likelihood-layout"
import {
  fmt,
  getSeries,
  kindNames,
  type Program,
  quantile,
  type Run,
  type Site,
} from "@/lib/program"
import { curveFor, inputsOf, runShape, weightsFor } from "@/lib/trace"
import { Expression } from "./expression"
import { FitRecord } from "./fit-record"
import { icons } from "./map"
import { AuditCurve } from "./rank-curve"
import { TracePlot } from "./trace-plot"

const symbol = (site: Site) => site.symbol ?? site.id
const definition = (site: Site) => site.definition ?? site.formula
type Arrangement = "hierarchical" | "compact"
let preferredArrangement: Arrangement = "hierarchical"
function cardSizes(
  sites: Site[],
  folded: ReadonlySet<string>,
  heights: ReadonlyMap<string, number>
): LayoutNode[] {
  return sites.map((n) => ({
    id: n.id,
    width: n.kind === "input" ? 200 : 280,
    height: heights.get(n.id) ?? (n.kind === "input" ? 44 : 175),
    parents: folded.has(n.id) ? [] : inputsOf(n),
  }))
}
const blank: number[] = []
function average(v: number[], weights?: Float64Array) {
  return v.reduce((s, x, i) => s + x * (weights ? weights[i] : 1 / v.length), 0)
}
function interval(values: number[], mass = 0.9) {
  const sorted = [...values].sort((a, b) => a - b)
  return fmt(quantile(sorted, (1 - mass) / 2)) + " – " + fmt(quantile(sorted, (1 + mass) / 2))
}
function chartData(
  run: Run | undefined,
  site: Site,
  coordinate: string,
  draw: number,
  visible: number,
  weights?: Float64Array
) {
  const s = getSeries(run, site.id, coordinate),
    c = s.key ?? "Scalar"
  const observed = site.kind === "observed",
    fixed = site.kind === "input"
  const attached = run?.connection?.links.find((l) => l.site === site.id)
  const measured = observed
    ? (attached?.values ?? Object.values(run?.values[site.id] ?? {}).map((v) => v[0]))
    : undefined
  const values = fixed ? blank : (measured ?? s.values ?? blank)
  const referenceCoords = run?.connection?.prior[site.id]
  const reference =
    observed || fixed ? undefined : (referenceCoords?.[c] ?? referenceCoords?.Scalar)
  const law = run?.laws?.[site.id],
    curve = observed || reference ? undefined : curveFor(law, c, draw, runShape(run, site))
  return {
    values,
    count: observed ? values.length : Math.min(visible, values.length),
    reference,
    discrete: /^(Binomial|Poisson|Bernoulli|Categorical|Geometric|NegativeBinomial)/.test(
      law?.family ?? site.formula
    ),
    curve,
    marker: s.values?.[draw],
    coords: s.keys,
    coord: c,
    weights: !observed && weights && values.length === weights.length ? weights : undefined,
    law,
    name:
      curve?.name ??
      law?.family ??
      (fixed
        ? "Fixed input"
        : site.kind === "derived"
          ? "Deterministic"
          : site.kind === "observed"
            ? "Observation"
            : site.kind === "factor"
              ? "Log density"
              : "Saved draws"),
    params: curve?.params ?? site.formula,
  }
}
type ExplorerToolbar = {
  settings?: ReactNode
  picker: ReactNode
  actions: ReactNode
  dataAction?: (run: Run | undefined) => ReactNode
  referenceRows?: (run: Run) => void
}
export function TraceCanvas({
  program: p,
  toolbar,
  initialRun,
}: {
  program: Program
  toolbar?: ExplorerToolbar
  initialRun?: string
}) {
  const [ri, setRi] = useState(() =>
    Math.max(
      0,
      initialRun
        ? p.runs.findIndex((r) => r.name === initialRun)
        : p.runs.findIndex((r) => r.evidence?.length)
    )
  )
  const [folded, setFolded] = useState(() => new Set<string>())
  const run = p.runs[ri]
  return (
    <CanvasRun
      key={ri}
      p={p}
      run={run}
      ri={ri}
      setRi={setRi}
      toolbar={toolbar}
      folded={folded}
      setFolded={setFolded}
    />
  )
}
function CanvasRun({
  p,
  run,
  ri,
  setRi,
  toolbar,
  folded,
  setFolded,
}: {
  folded: Set<string>
  setFolded: (ids: Set<string>) => void
  p: Program
  run: Run | undefined
  ri: number
  toolbar?: ExplorerToolbar
  setRi: (n: number) => void
}) {
  const options = useRef<HTMLDivElement>(null)
  const [heights, setHeights] = useState(() => new Map<string, number>())
  const [arrangement, setArrangement] = useState<Arrangement>(preferredArrangement)
  const graph = useMemo(() => dependencies(p.nodes), [p.nodes])
  const displayed = useMemo(() => visibleDependencies(graph, folded), [graph, folded])
  const sites = useMemo(() => p.nodes.filter((n) => displayed.has(n.id)), [p.nodes, displayed])
  const { nodes, junctions } = useMemo(
    () => sharedLikelihoods(sites, cardSizes(sites, folded, heights), folded),
    [sites, folded, heights]
  )
  const compactScene = useMemo(() => layoutGraph(nodes), [nodes])
  const [arranged, setArranged] = useState<{ nodes: LayoutNode[]; scene: Scene | null } | null>(
    null
  )
  useEffect(() => {
    if (
      arrangement !== "hierarchical" ||
      nodes.some((n) => !junctions.has(n.id) && !heights.has(n.id))
    )
      return
    let active = true
    hierarchicalLayout(nodes).then(
      (scene) => {
        if (active) setArranged({ nodes, scene })
      },
      () => {
        if (active) setArranged({ nodes, scene: null })
      }
    )
    return () => {
      active = false
    }
  }, [arrangement, nodes, heights, junctions])
  const ready = arranged?.nodes === nodes
  const scene =
    arrangement === "hierarchical" && ready && arranged.scene ? arranged.scene : compactScene
  const layoutState =
    arrangement === "compact"
      ? "compact"
      : !ready
        ? "arranging"
        : arranged.scene
          ? "hierarchical"
          : "fallback"
  const byId = useMemo(() => new Map(p.nodes.map((n) => [n.id, n])), [p])
  const N = run?.count ?? 0,
    rows = run?.evidence
  const [revealed, setRevealed] = useState<number | null>(null)
  const [used, setUsed] = useState(run?.reference?.kind === "evidence" ? (rows?.length ?? 0) : 0),
    [candidate, setCandidate] = useState(0)
  const animating = revealed !== null,
    visible = revealed ?? N
  useEffect(() => {
    if (!animating) return
    const start = performance.now()
    const timer = window.setInterval(() => {
      const fraction = (performance.now() - start) / 3000
      setRevealed(fraction >= 1 ? null : Math.max(1, Math.floor(fraction * N)))
    }, 100)
    return () => clearInterval(timer)
  }, [animating, N])
  type Link = { parent: string; child: string }
  const [hoverLink, setHoverLink] = useState<Link | null>(null),
    [lockedLink, setLockedLink] = useState<Link | null>(null)
  const traced = lockedLink ?? hoverLink
  function stopTracing() {
    setHoverLink(null)
    setLockedLink(null)
  }
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [plotOpen, setPlotOpen] = useState(false)
  const detailsToggle = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const origin = useRef<HTMLElement | null>(null)
  const [pinned, pin] = useState<string | null>(null),
    [coords, setCoords] = useState<Record<string, string>>({}),
    [follow, setFollow] = useState(true)
  const pivot = useRef<{ id: string; x: number; y: number } | null>(null)
  const stopFollowing = useCallback(() => {
    pivot.current = null
    setFollow(false)
  }, [])
  const viewport = useRef<HTMLDivElement>(null)
  const { zoom, zoomTo, zoomBy, gestures } = useCanvasCamera(
    viewport,
    stopFollowing,
    scene.w,
    scene.h
  )
  const [box, setBox] = useState({ w: 700, h: 450 }),
    uid = useId().replaceAll(":", "")
  const evidence = rows?.[used - 1],
    intended = evidence?.site ?? p.initial ?? p.nodes[0].id,
    active = displayed.has(intended) ? intended : graph.outputs[0],
    site = byId.get(pinned ?? active) as Site
  const currentCoord = (n: Site) => coords[n.id] ?? (evidence?.site === n.id ? evidence.coord : "")
  const weighted = useMemo(
    () => (rows && used > 0 ? weightsFor(rows, used, N) : undefined),
    [rows, used, N]
  )
  const before = useMemo(
    () => (rows && used > 1 ? weightsFor(rows, used - 1, N) : undefined),
    [rows, used, N]
  )
  const weight = weighted?.weights
  const currentSiteData = (n: Site) =>
    chartData(run, n, currentCoord(n), candidate, visible, weight)
  const selected = currentSiteData(site)
  function center(id: string, z = zoom) {
    const pt = scene.positions.get(id),
      el = viewport.current
    if (el && pt)
      el.scrollTo({
        left: canvasInset(el.clientWidth, scene.w, z) + pt.x * z - el.clientWidth / 2,
        top: canvasInset(el.clientHeight, scene.h, z) + pt.y * z - el.clientHeight / 2,
      })
  }
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    const observer = new ResizeObserver(read)
    observer.observe(el)
    read()
    return () => {
      observer.disconnect()
    }
  }, [])
  // Route edges against the rendered card sizes, including wrapped source code.
  useLayoutEffect(() => {
    const cards = viewport.current?.querySelectorAll<HTMLButtonElement>(".trace-card")
    if (!cards?.length) return
    const measure = () => {
      const next = new Map(Array.from(cards, (card, i) => [sites[i].id, card.offsetHeight]))
      setHeights((old) =>
        next.size === old.size && [...next].every(([id, h]) => old.get(id) === h) ? old : next
      )
    }
    const observer = new ResizeObserver(measure)
    for (const card of cards) observer.observe(card)
    measure()
    return () => observer.disconnect()
  }, [sites])
  useLayoutEffect(() => {
    const el = viewport.current,
      pt = scene.positions.get(active)
    const anchor = pivot.current
    if (anchor && el) {
      const position = scene.positions.get(anchor.id)
      if (position)
        el.scrollTo(
          canvasInset(el.clientWidth, scene.w, zoom) + position.x * zoom - anchor.x,
          canvasInset(el.clientHeight, scene.h, zoom) + position.y * zoom - anchor.y
        )
      if (layoutState !== "arranging") pivot.current = null
      return
    }
    if (!el || !pt || !follow) return
    const x = canvasInset(el.clientWidth, scene.w, zoom) + pt.x * zoom - el.scrollLeft,
      y = canvasInset(el.clientHeight, scene.h, zoom) + pt.y * zoom - el.scrollTop
    if (
      x < (pt.width * zoom) / 2 ||
      y < (pt.height * zoom) / 2 ||
      x > el.clientWidth - (pt.width * zoom) / 2 ||
      y > el.clientHeight - (pt.height * zoom) / 2
    )
      el.scrollTo(pt.x * zoom - el.clientWidth / 2, pt.y * zoom - el.clientHeight / 2)
  }, [active, follow, scene, zoom, layoutState])
  const inspectorScroll = useRef<HTMLDivElement>(null)
  function openDetails() {
    if (!detailsOpen)
      origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDetailsOpen(true)
  }
  function closeDetails() {
    setDetailsOpen(false)
    setPlotOpen(false)
    pin(null)
    const target = origin.current?.isConnected ? origin.current : detailsToggle.current
    target?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (detailsOpen) closeButton.current?.focus({ preventScroll: true })
  }, [detailsOpen])
  function toggleInputs(id: string) {
    const el = viewport.current,
      point = scene.positions.get(id)
    if (el && point)
      pivot.current = {
        id,
        x: canvasInset(el.clientWidth, scene.w, zoom) + point.x * zoom - el.scrollLeft,
        y: canvasInset(el.clientHeight, scene.h, zoom) + point.y * zoom - el.scrollTop,
      }
    const next = new Set(folded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    stopTracing()
    pin(id)
    setFolded(next)
  }
  function inspect(id: string, scroll = false) {
    stopTracing()
    openDetails()
    inspectorScroll.current?.scrollTo(0, 0)
    pin(id)
    if (!displayed.has(id)) {
      const el = viewport.current
      if (el) pivot.current = { id, x: el.clientWidth / 2, y: el.clientHeight / 2 }
      setFolded(revealDependency(id, graph, displayed, folded))
    } else if (scroll) center(id)
  }
  const consumers = p.nodes.filter((n) => inputsOf(n).includes(site.id))
  const labelFor = (id: string) =>
    junctions.has(id) ? junctions.get(id)!.id + " likelihood" : (byId.get(id)?.symbol ?? id)
  const sources = new Set(inputsOf(site))
  const paired =
    site.kind === "observed" && byId.has(site.id + "__rep")
      ? site.id + "__rep"
      : site.kind === "predictive" && site.id.endsWith("__rep") && byId.has(site.id.slice(0, -5))
        ? site.id.slice(0, -5)
        : undefined
  const legend = [
    { label: "Selected draw’s law", mark: "line" as const, colour: "var(--foreground)" },
    ...(run?.connection
      ? [{ label: "Prior draws", mark: "line" as const, colour: "var(--series-3)" }]
      : []),
    {
      label: run?.connection ? "Posterior draws" : "Saved draws",
      mark: "square" as const,
      colour: "var(--series-1)",
    },
    ...(p.nodes.some((n) => n.kind === "observed")
      ? [{ label: "Observed value", mark: "line" as const, colour: "var(--series-2)" }]
      : []),
    ...(weight
      ? [{ label: "After evidence", mark: "line" as const, colour: "var(--series-3)" }]
      : []),
  ]
  const settings = (
    <>
      {toolbar && (
        <label className="replay-setting">
          Layout
          <select
            aria-label="Graph layout"
            value={arrangement}
            onChange={(e) => {
              preferredArrangement = e.target.value as Arrangement
              setArrangement(preferredArrangement)
              setFollow(true)
              options.current?.hidePopover()
            }}
          >
            <option value="hierarchical">Hierarchical · right-angle wires</option>
            <option value="compact">Compact · short wires</option>
          </select>
          {layoutState === "fallback" && (
            <small>Compact layout shown because hierarchical placement failed.</small>
          )}
        </label>
      )}
      {toolbar?.settings}
      {p.runs.length > 1 && (
        <label className="replay-setting">
          Saved run
          <select aria-label="Canvas run" value={ri} onChange={(e) => setRi(+e.target.value)}>
            {p.runs.map((r, i) => (
              <option key={r.name} value={i}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!!rows?.length && (
        <label className="replay-setting">
          Condition on recorded data
          <select
            aria-label="Applied observations"
            value={used}
            onChange={(e) => {
              setUsed(+e.target.value)
              setRevealed(null)
              options.current?.hidePopover()
            }}
          >
            <option value="0">No observations</option>
            {rows.map((row, i) => (
              <option key={row.site + row.coord} value={i + 1}>
                {i + 1} / {rows.length} · {row.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
  const observation =
    evidence &&
    `${labelFor(evidence.site)}${evidence.coord === "Scalar" ? "" : evidence.coord} = ${fmt(evidence.observed)}`
  const evidenceLine = evidence && (
    <div className="trace-event">
      <span title={evidence.detail}>
        <strong>{evidence.label}</strong> · {evidence.detail}
      </span>
      <button
        type="button"
        onClick={() => {
          setCoords({ ...coords, [evidence.site]: evidence.coord })
          inspect(evidence.site, true)
        }}
      >
        Inspect evidence
      </button>
    </div>
  )
  const drawPicker = N > 1 && (
    <label className="candidate-control">
      Draw{" "}
      <b>
        {candidate + 1} / {N}
      </b>
      <input
        type="range"
        aria-label="Selected draw"
        min="1"
        max={N}
        value={candidate + 1}
        onChange={(e) => setCandidate(+e.target.value - 1)}
      />
    </label>
  )
  const inspector = detailsOpen && (
    <aside className="trace-detail" aria-label="Variable details" id={uid + "-detail"}>
      <div className="trace-bar detail-heading">
        <h3 className="tc-symbol" title={site.name}>
          {symbol(site)}
        </h3>
        {pinned && evidence && (
          <button
            type="button"
            title="Follow active variable"
            onClick={() => {
              pin(null)
              center(active)
            }}
          >
            Follow active
          </button>
        )}
        <button
          type="button"
          ref={closeButton}
          aria-label="Close variable details"
          title="Close variable details"
          onClick={closeDetails}
        >
          <X size={16} />
        </button>
      </div>
      <div className="trace-detail-scroll" ref={inspectorScroll}>
        {selected.coords.length > 1 && (
          <label className="coord">
            Coordinate{" "}
            <select
              aria-label="Canvas coordinate"
              value={selected.coord}
              onChange={(e) => setCoords({ ...coords, [site.id]: e.target.value })}
            >
              {selected.coords.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        )}
        {site.kind === "input" ? (
          <p className="detail-reading">
            Fixed value <b>{selected.marker === undefined ? "—" : fmt(selected.marker)}</b>
          </p>
        ) : run?.rankCurve && selected.values.length > 0 && site.kind !== "observed" ? (
          <p className="detail-reading">
            Posterior median{" "}
            <b>
              {fmt(
                quantile(
                  [...selected.values].sort((a, b) => a - b),
                  0.5
                )
              )}
            </b>
          </p>
        ) : selected.count > 0 ? (
          <p className="detail-reading">
            {run?.connection?.analytic?.[site.id] && (
              <p>
                Exact update <code>{run.connection.analytic[site.id]}</code>
              </p>
            )}
            {selected.reference && (
              <>
                Prior mean <b>{fmt(average(selected.reference))}</b> →{" "}
              </>
            )}
            {site.kind === "observed"
              ? "Observed mean"
              : selected.reference
                ? "Posterior mean"
                : "Run mean"}{" "}
            <b>
              {fmt(
                average(selected.values, site.kind === "observed" ? undefined : before?.weights)
              )}
            </b>
            {selected.weights && (
              <>
                {" "}
                → <b>{fmt(average(selected.values, selected.weights))}</b>{" "}
                <small>after observation</small>
              </>
            )}
          </p>
        ) : (
          <p className="detail-reading">{site.detail || site.name}</p>
        )}
        {run?.rankCurve &&
          selected.values.length > 0 &&
          site.kind !== "input" &&
          site.kind !== "observed" && (
            <p className="detail-reading">
              {Math.round(100 * run.rankCurve.mass)}% credible interval{" "}
              <b>{interval(selected.values, run.rankCurve.mass)}</b>
            </p>
          )}
        {run?.rankCurve && (site.id === "precision" || site.id === "recall") && (
          <AuditCurve curve={run.rankCurve} metric={site.id} coordinate={selected.coord} />
        )}
        {selected.reference && (
          <p className="module-hint">
            Middle 90% of draws · prior {interval(selected.reference)} → posterior{" "}
            {interval(selected.values)}
          </p>
        )}
        {paired && (
          <div className="links">
            <button type="button" onClick={() => inspect(paired, true)}>
              {site.kind === "observed" ? "View predictive replicate" : "View measured outcome"} ·{" "}
              {labelFor(paired)}
            </button>
          </div>
        )}
        {run?.connection && (
          <p className="module-hint">
            {run.connection.file} · {run.connection.rows} rows · {run.connection.divergences}{" "}
            divergent transitions
          </p>
        )}
        {weighted && evidence && (
          <div className="detail-evidence">
            <p className="detail-observed">
              <span>Observed</span> <code>{observation}</code>
            </p>
            {drawPicker}
            <p className="weight-change">
              Weight <b>{fmt(100 * (before?.weights[candidate] ?? 1 / N))}%</b> →{" "}
              <b>{fmt(100 * weighted.weights[candidate])}%</b>
            </p>
            <details className="detail-section">
              <summary>Likelihood and effective count</summary>
              <p>
                {evidence.label} · {evidence.detail}
              </p>
              <p>
                Log likelihood <b>{fmt(evidence.logLikelihood[candidate])}</b>
              </p>
              <p>
                Effective candidates{" "}
                <b>
                  {fmt(weighted.ess)} / {N}
                </b>
              </p>
              <button
                type="button"
                className="action"
                onClick={() =>
                  setCandidate(
                    weighted.weights.indexOf(weighted.weights.reduce((a, b) => Math.max(a, b), 0))
                  )
                }
              >
                Inspect highest weight
              </button>
            </details>
          </div>
        )}
        <details className="detail-section" onToggle={(e) => setPlotOpen(e.currentTarget.open)}>
          <summary>Distribution</summary>
          {plotOpen && (
            <>
              {!weighted && drawPicker}
              <p>
                {selected.name} · {selected.count}{" "}
                {site.kind === "observed" ? "measurements" : "draws"}
              </p>
              <Legend
                className="explorer-legend text-xs"
                items={legend.filter(
                  (item) =>
                    (item.label !== "Selected draw’s law" || selected.curve) &&
                    (item.label !== "Observed value" ||
                      (site.kind === "observed" && selected.marker !== undefined))
                )}
              />
              <TracePlot
                large
                values={selected.values}
                visible={selected.count}
                curve={selected.curve}
                marker={selected.marker}
                observed={site.kind === "observed"}
                weights={selected.weights}
                reference={selected.reference}
                discrete={selected.discrete}
              />
            </>
          )}
        </details>
        <details className="detail-section">
          <summary>Variable and run details</summary>
          <p>
            {site.name} · {site.group}
          </p>
          <Expression className="formula" source={definition(site)} />
          {site.detail && <p>{site.detail}</p>}
          {inputsOf(site).length > 0 && (
            <div className="links">
              <span className="label">Receives from</span>
              {inputsOf(site).map((id) => (
                <button type="button" key={id} onClick={() => inspect(id, true)}>
                  {labelFor(id)}
                </button>
              ))}
            </div>
          )}
          {consumers.length > 0 && (
            <div className="links">
              <span className="label">Supplies</span>
              {consumers.map((n) => (
                <button type="button" key={n.id} onClick={() => inspect(n.id, true)}>
                  {symbol(n)}
                </button>
              ))}
            </div>
          )}
          <p>{run?.note ?? "Structure only."}</p>
          {run?.fit && <FitRecord fit={run.fit} />}
        </details>
      </div>
    </aside>
  )
  return (
    <section
      className="trace-studio"
      aria-label="Draw canvas"
      onKeyDown={(e) => {
        if (e.key === "Escape" && traced && !options.current?.matches(":popover-open")) {
          stopTracing()
          e.stopPropagation()
          return
        }
        if (
          e.key === "Escape" &&
          detailsOpen &&
          !options.current?.matches(":popover-open") &&
          !(e.target instanceof HTMLSelectElement)
        ) {
          closeDetails()
          e.stopPropagation()
        }
      }}
    >
      <div className={toolbar ? "trace-controls explorer-toolbar" : "trace-controls"}>
        {toolbar?.picker}
        {toolbar?.dataAction?.(run)}
        {run?.reference && toolbar?.referenceRows && (
          <button
            type="button"
            className="reference-source"
            title={run.reference.source}
            onClick={() => toolbar.referenceRows?.(run)}
          >
            {run.reference.kind === "fit"
              ? "Saved fit"
              : run.reference.kind === "evidence"
                ? "Evidence replay"
                : run.reference.kind === "forecast"
                  ? "Reference buy"
                  : run.reference.kind === "audit"
                    ? "Judge responses"
                    : "Measured Planner cells"}{" "}
            · {run.reference.rows.length} {run.reference.rows.length === 1 ? "row" : "rows"}
            {run.connection?.divergences
              ? ` · ${run.connection.divergences} ${run.connection.divergences === 1 ? "divergence" : "divergences"}`
              : ""}
          </button>
        )}
        {run?.connection && !run.reference && (
          <div className="dataset-summary" role="status">
            <strong>{run.connection.file}</strong> · {run.connection.rows} rows ·{" "}
            {run.connection.links.map((l) => l.column + " → " + l.site).join(", ")} · NUTS
            {run.connection.divergences > 0 && (
              <b>
                {" "}
                · {run.connection.divergences} divergent{" "}
                {run.connection.divergences === 1 ? "transition" : "transitions"}
              </b>
            )}
          </div>
        )}

        {N > 1 && (
          <button
            type="button"
            className="draw-replay"
            aria-label={animating ? "Show all" : "Animate draws"}
            title={animating ? "Show all" : "Animate draws"}
            onClick={() => setRevealed(animating ? null : 1)}
          >
            {animating ? <SkipForward size={15} /> : <Play size={15} />}
            <span>{animating ? "Show all" : "Animate draws"}</span>
          </button>
        )}
        {toolbar && (
          <>
            <button
              className="explorer-more"
              type="button"
              popoverTarget={uid + "-options"}
              aria-label="Canvas options"
              title="Canvas options"
            >
              <Ellipsis size={19} />
            </button>
            <div className="explorer-options" id={uid + "-options"} popover="auto" ref={options}>
              <div className="explorer-transport">{settings}</div>
              <div className="explorer-files" onClickCapture={() => options.current?.hidePopover()}>
                {run?.reference && toolbar.referenceRows && (
                  <button type="button" onClick={() => toolbar.referenceRows?.(run)}>
                    View reference data
                  </button>
                )}
                {toolbar.actions}
              </div>
            </div>
          </>
        )}
        {!toolbar && settings}
      </div>
      <div className="trace-split">
        <div className="trace-left">
          {!toolbar && (
            <div className="trace-bar">
              <span className="label">{p.nodes.length} variables</span>
              <Legend className="text-xs" items={legend} />
            </div>
          )}
          <div className="trace-stage">
            <div
              className="trace-view"
              ref={viewport}
              {...gestures}
              onPointerDown={(e) => {
                if (!(e.target instanceof Element && e.target.closest(".wire-hit"))) stopTracing()
                gestures.onPointerDown(e)
              }}
            >
              <div
                className="trace-space"
                style={{
                  width: Math.max(scene.w * zoom, box.w),
                  height: Math.max(scene.h * zoom, box.h),
                }}
              >
                <div
                  className="trace-world"
                  data-layout={layoutState}
                  style={{
                    left: canvasInset(box.w, scene.w, zoom),
                    top: canvasInset(box.h, scene.h, zoom),
                    width: scene.w,
                    height: scene.h,
                    transform: `scale(${zoom})`,
                  }}
                >
                  <svg
                    className="trace-wires"
                    width={scene.w}
                    height={scene.h}
                    data-tracing={traced ? true : undefined}
                    aria-label="Variable dependencies"
                  >
                    <defs>
                      {["base", "flow", "observed"].map((k) => (
                        <marker
                          key={k}
                          id={uid + k}
                          viewBox="0 0 10 10"
                          refX="9"
                          refY="5"
                          markerUnits="userSpaceOnUse"
                          markerWidth="8"
                          markerHeight="8"
                          orient="auto"
                        >
                          <path
                            d="M0 0L10 5L0 10Z"
                            fill={
                              k === "observed"
                                ? "var(--series-2)"
                                : k === "flow"
                                  ? "var(--primary)"
                                  : "var(--muted-foreground)"
                            }
                          />
                        </marker>
                      ))}
                    </defs>
                    {scene.edges.map((e) => {
                      const isTraced = traced?.parent === e.parent && traced.child === e.child
                      const hit = traced ? isTraced : e.child === site.id || e.parent === site.id
                      const points = e.points.map((q) => `${q.x},${q.y}`).join(" ")
                      const label = `${labelFor(e.parent)} → ${labelFor(e.child)}`
                      const lock = () => {
                        setLockedLink(
                          lockedLink?.parent === e.parent && lockedLink.child === e.child ? null : e
                        )
                      }
                      return (
                        <g key={JSON.stringify([e.parent, e.child])}>
                          <polyline
                            data-evidence={
                              byId.get(e.child)?.observedFrom === e.parent || undefined
                            }
                            data-parent={e.parent}
                            data-child={e.child}
                            className={hit ? "flow" : ""}
                            points={points}
                            markerEnd={`url(#${uid}${byId.get(e.child)?.observedFrom === e.parent ? "observed" : hit ? "flow" : "base"})`}
                          />
                          {/* biome-ignore lint/a11y/useSemanticElements: The interactive hit area must follow an SVG path; HTML buttons have rectangular bounds. */}
                          <path
                            className="wire-hit"
                            d={"M" + points.split(" ").join(" L")}
                            role="button"
                            aria-label={label}
                            aria-pressed={
                              lockedLink?.parent === e.parent && lockedLink.child === e.child
                            }
                            tabIndex={e.parent === site.id || e.child === site.id ? 0 : -1}
                            onPointerEnter={(ev) => {
                              if (ev.pointerType === "mouse" && !ev.buttons) setHoverLink(e)
                            }}
                            onPointerLeave={() => setHoverLink(null)}
                            onFocus={() => setHoverLink(e)}
                            onBlur={() => setHoverLink(null)}
                            onClick={lock}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault()
                                lock()
                              }
                            }}
                          />
                        </g>
                      )
                    })}
                  </svg>
                  {Array.from(junctions, ([id, y]) => {
                    const box = scene.positions.get(id)!
                    const name =
                      run?.laws?.[y.id]?.family.replace(/Probs$|Logits$/, "") ?? "Likelihood"
                    return (
                      <div
                        key={id}
                        className="likelihood-junction"
                        data-junction={id}
                        data-outcome={y.id}
                        title={`Shared likelihood for ${y.id} and ${y.id}__rep. ${definition(y).split("\n")[0]}`}
                        style={{
                          left: box.x - box.width / 2,
                          top: box.y - box.height / 2,
                          width: box.width,
                          height: box.height,
                        }}
                      >
                        <span aria-hidden="true">◇</span>
                        {name}
                      </div>
                    )
                  })}
                  {sites.map((n) => {
                    const pt = scene.positions.get(n.id)!,
                      d = currentSiteData(n),
                      Icon = icons[n.kind],
                      canFold = !!graph.parents.get(n.id)?.length
                    return (
                      <Fragment key={n.id}>
                        <button
                          type="button"
                          data-foldable={canFold || undefined}
                          data-node={n.id}
                          data-kind={n.kind}
                          data-parquet={n.group === "Parquet data" || undefined}
                          data-endpoint={
                            traced && (n.id === traced.parent || n.id === traced.child)
                              ? true
                              : undefined
                          }
                          data-count={d.count}
                          className={`trace-card ${n.id === site.id ? "live " : ""}${detailsOpen && n.id === site.id ? "inspected " : ""}${sources.has(n.id) ? "upstream" : ""}`}
                          style={{
                            left: pt.x - pt.width / 2,
                            top: pt.y - pt.height / 2,
                            width: pt.width,
                          }}
                          aria-label={`Inspect ${n.group === "Parquet data" ? "data column" : "variable"} ${symbol(n)}`}
                          onClick={() => inspect(n.id)}
                        >
                          {n.kind === "input" ? (
                            <>
                              <span className="tc-input-name">
                                <strong className="tc-symbol">{symbol(n)}</strong>
                                {d.coord !== "Scalar" && <small>{d.coord}</small>}
                              </span>
                              <b
                                className="tc-input-value"
                                title={
                                  d.marker === undefined ? "Value unavailable" : String(d.marker)
                                }
                              >
                                {d.marker === undefined ? "—" : fmt(d.marker)}
                              </b>
                              <span className="tc-input-source">
                                <span>{n.group === "Parquet data" ? "Parquet" : "Fixed"}</span>
                                <Expression
                                  className="tc-definition"
                                  source={definition(n)}
                                  columns={20}
                                />
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="tc-type">
                                <Icon size={13} />
                                {n.kind === "predictive" && n.id.endsWith("__rep")
                                  ? "Predictive replicate"
                                  : kindNames[n.kind]}
                                <small>
                                  {folded.has(n.id)
                                    ? `${graph.parents.get(n.id)!.length} inputs`
                                    : evidence?.site === n.id
                                      ? "OBSERVED"
                                      : n.kind === "predictive" && n.id.endsWith("__rep")
                                        ? "Paired with " + n.id.slice(0, -5)
                                        : n.group}
                                </small>
                              </span>
                              <strong className="tc-symbol">{symbol(n)}</strong>
                              <Expression className="tc-definition" source={definition(n)} />
                              {run?.connection?.analytic?.[n.id] && (
                                <span className="tc-params" title="Exact conjugate update">
                                  {run.connection.analytic[n.id]}
                                </span>
                              )}
                              {d.reference && (
                                <span className="tc-comparison">
                                  <i />
                                  Prior mean {fmt(average(d.reference))} <span>→</span>{" "}
                                  <b>Posterior {fmt(average(d.values))}</b>
                                </span>
                              )}
                              {d.curve && (
                                <span className="tc-params" title={d.params}>
                                  {d.params}
                                </span>
                              )}
                              {(!run || run.values[n.id]) && (
                                <TracePlot
                                  values={d.values}
                                  visible={d.count}
                                  curve={d.curve}
                                  marker={d.marker}
                                  observed={n.kind === "observed"}
                                  weights={d.weights}
                                  reference={d.reference}
                                  discrete={d.discrete}
                                />
                              )}
                              <span className="tc-foot">
                                <span>
                                  {run && !run.values[n.id]
                                    ? "Structure only"
                                    : `${d.count} ${n.kind === "observed" ? "measurements" : "draws"}`}
                                </span>
                                <b
                                  title={
                                    n.kind === "observed"
                                      ? "Observed measurements"
                                      : `Draw ${candidate + 1} value`
                                  }
                                >
                                  {n.kind === "observed" && d.values.length > 1
                                    ? d.values.length <= 4
                                      ? d.values.map(fmt).join(" · ")
                                      : "mean " + fmt(average(d.values))
                                    : d.marker === undefined
                                      ? "—"
                                      : fmt(d.marker)}
                                </b>
                              </span>
                            </>
                          )}
                        </button>
                        {canFold && (
                          <button
                            type="button"
                            className="trace-fold"
                            data-fold={n.id}
                            aria-expanded={!folded.has(n.id)}
                            aria-label={`${folded.has(n.id) ? "Expand" : "Collapse"} inputs to ${symbol(n)}`}
                            title={`${folded.has(n.id) ? "Expand" : "Collapse"} ${graph.parents.get(n.id)!.length} inputs to ${symbol(n)}`}
                            style={{
                              left: pt.x + pt.width / 2 - 28,
                              top: pt.y - pt.height / 2 + 3,
                            }}
                            onClick={() => toggleInputs(n.id)}
                          >
                            {folded.has(n.id) ? <Plus size={13} /> : <Minus size={13} />}
                          </button>
                        )}
                      </Fragment>
                    )
                  })}
                </div>
              </div>
            </div>
            {traced && (
              <aside className="wire-note" aria-label="Traced dependency">
                <button
                  type="button"
                  onClick={() => inspect(junctions.get(traced.parent)?.id ?? traced.parent, true)}
                >
                  {labelFor(traced.parent)}
                </button>
                <span aria-hidden="true">→</span>
                <button
                  type="button"
                  onClick={() => inspect(junctions.get(traced.child)?.id ?? traced.child, true)}
                >
                  {labelFor(traced.child)}
                </button>
                {lockedLink && (
                  <button type="button" aria-label="Clear traced dependency" onClick={stopTracing}>
                    <X size={13} />
                  </button>
                )}
              </aside>
            )}
            {inspector}
          </div>
          {evidenceLine}
          <div className="trace-navigation">
            <button
              type="button"
              ref={detailsToggle}
              aria-label="Variable details"
              title="Variable details"
              aria-expanded={detailsOpen}
              aria-controls={detailsOpen ? uid + "-detail" : undefined}
              onClick={() => {
                if (detailsOpen) closeDetails()
                else openDetails()
              }}
            >
              <PanelRightOpen size={15} />
            </button>
            <select
              aria-label="Locate a variable"
              value={site.id}
              onChange={(e) => inspect(e.target.value, true)}
            >
              {p.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {labelFor(n.id)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={follow}
              title="Follow active site"
              aria-label="Follow active site"
              onClick={() => {
                setFollow(!follow)
                if (!follow) center(active)
              }}
            >
              <LocateFixed size={15} />
            </button>
            <button type="button" aria-label="Zoom canvas out" onClick={() => zoomBy(1 / 1.25)}>
              <Minus size={14} />
            </button>
            <button type="button" aria-label="Actual size" onClick={() => zoomTo(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" aria-label="Zoom canvas in" onClick={() => zoomBy(1.25)}>
              <Plus size={14} />
            </button>
            <button
              type="button"
              aria-label="Fit all variables"
              onClick={() => zoomTo(Math.min(box.w / scene.w, box.h / scene.h, 1))}
            >
              <Maximize size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
