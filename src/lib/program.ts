export const kinds = [
  "random",
  "derived",
  "observed",
  "input",
  "parameter",
  "predictive",
  "factor",
] as const
export type Kind = (typeof kinds)[number]
export const kindNames: Record<Kind, string> = {
  random: "Random variable",
  derived: "Calculation",
  observed: "Observation",
  input: "Fixed input",
  parameter: "Parameter",
  predictive: "Prediction",
  factor: "Log factor",
}
export interface Site {
  symbol?: string
  definition?: string
  id: string
  name: string
  kind: Kind
  group: string
  formula: string
  detail: string
  parents: string[]
  shape: number[]
  plates: string[]
  observedFrom?: string
  line?: number
}
export interface Law {
  basis?: "posterior"
  family: string
  parameters: Record<string, Record<string, number[]>>
}
export interface Evidence {
  site: string
  coord: string
  label: string
  detail: string
  observed: number
  logLikelihood: number[]
}
export interface DataConnectionRecord {
  inputs?: Record<string, string>
  analytic?: Record<string, string>
  file: string
  rows: number
  divergences: number
  links: { site: string; column: string; node: string; values: number[] }[]
  prior: Record<string, Record<string, number[]>>
}
export interface ReferenceData {
  kind: "fit" | "evidence" | "forecast" | "planner" | "audit"
  source: string
  rows: Record<string, string | number | boolean>[]
}
type CurveBand = { lower: number[]; estimate: number[]; upper: number[] }
export interface RankCurve {
  rank: number[]
  mass: number
  precision: CurveBand
  recall: CurveBand
}
export interface Run {
  rankCurve?: RankCurve
  reference?: ReferenceData
  connection?: DataConnectionRecord
  fit?: {
    method: string
    origin: string
    note: string
    metrics: Record<string, number>
    loss?: number[]
  }
  mode?: "prior" | "posterior" | "predictive"
  shapes?: Record<string, number[]>
  evidence?: Evidence[]
  laws?: Record<string, Law>
  name: string
  note: string
  count: number
  values: Record<string, Record<string, number[]>>
}
export interface Experiment {
  threshold?: number
  title: string
  note: string
  xLabel: string
  yLabel: string
  cases: { x: number; values: number[] }[]
}
export interface Program {
  experiments?: Experiment[]
  version: 1
  name: string
  description: string
  nodes: Site[]
  runs: Run[]
  source: { file: string; start: number; text: string; digest?: string }
  initial?: string
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string")
function required(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message)
}
export function readProgram(v: unknown): Program {
  required(record(v) && v.version === 1, "Choose a Probability Lab version 1 JSON file.")
  required(
    typeof v.name === "string" && v.name.trim() && typeof v.description === "string",
    "The program needs a name and description."
  )
  required(
    record(v.source) &&
      typeof v.source.text === "string" &&
      typeof v.source.file === "string" &&
      Number.isSafeInteger(v.source.start) &&
      Number(v.source.start) >= 1,
    "The source needs a file name, starting line and text."
  )
  required(
    Array.isArray(v.nodes) && v.nodes.length > 0 && v.nodes.length <= 500,
    "Provide between 1 and 500 nodes."
  )
  const ids = new Set<string>()
  for (const n of v.nodes) {
    required(
      record(n) &&
        typeof n.id === "string" &&
        n.id.length > 0 &&
        !ids.has(n.id) &&
        !(n.id in Object.prototype),
      "Node identifiers must be unique and nonempty."
    )
    required(
      typeof n.name === "string" &&
        typeof n.group === "string" &&
        n.group.trim() &&
        typeof n.formula === "string" &&
        (n.symbol === undefined || (typeof n.symbol === "string" && n.symbol.trim().length > 0)) &&
        (n.definition === undefined || typeof n.definition === "string") &&
        typeof n.detail === "string" &&
        kinds.includes(n.kind as Kind),
      "Each node needs a name, group, kind, formula and detail."
    )
    required(
      strings(n.parents) &&
        strings(n.plates) &&
        Array.isArray(n.shape) &&
        n.shape.every((i) => Number.isSafeInteger(i) && i >= 0),
      "Invalid node dimensions, parents or plates."
    )
    required(n.line === undefined || Number.isSafeInteger(n.line), "Invalid source line.")
    ids.add(n.id)
  }
  const visited = new Set<string>(),
    active = new Set<string>()
  const byId = new Map((v.nodes as Site[]).map((n) => [n.id, n]))
  function visit(id: string) {
    if (visited.has(id)) return
    required(!active.has(id), "Dependency cycles need to be unrolled before import.")
    active.add(id)
    const n = byId.get(id) as Site
    for (const p of [...n.parents, ...(n.observedFrom ? [n.observedFrom] : [])]) {
      required(ids.has(p), "A dependency references an unknown node.")
      visit(p)
    }
    active.delete(id)
    visited.add(id)
  }
  for (const id of ids) visit(id)
  for (const n of v.nodes as Site[])
    required(n.observedFrom === undefined || ids.has(n.observedFrom), "Invalid observation input.")
  required(
    v.initial === undefined || (typeof v.initial === "string" && ids.has(v.initial)),
    "Unknown initial selection."
  )
  required(
    Array.isArray(v.runs),
    "The program needs a runs array. Use an empty array for structure only."
  )
  const runNames = new Set<string>()
  for (const run of v.runs) {
    required(
      record(run) &&
        typeof run.name === "string" &&
        typeof run.note === "string" &&
        Number.isSafeInteger(run.count) &&
        Number(run.count) > 0 &&
        record(run.values),
      "Invalid saved run."
    )
    required(!runNames.has(run.name), "Each run needs a distinct name.")
    runNames.add(run.name)
    if (run.rankCurve !== undefined) {
      const curve = run.rankCurve
      required(
        record(curve) && typeof curve.mass === "number" && curve.mass > 0 && curve.mass < 1,
        "Invalid ranked-audit interval mass."
      )
      const ranks = curve.rank
      required(
        Array.isArray(ranks) &&
          ranks.length > 0 &&
          ranks.every((rank, i) => Number.isSafeInteger(rank) && rank > (i ? ranks[i - 1] : 0)),
        "Audit ranks must be increasing positive integers."
      )
      for (const key of ["precision", "recall"]) {
        const band = curve[key]
        required(record(band), "Expected precision and recall curves.")
        const { lower, estimate, upper } = band
        for (const column of [lower, estimate, upper]) {
          required(
            Array.isArray(column) &&
              column.length === ranks.length &&
              column.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
            "Invalid ranked-audit curve."
          )
        }
        required(
          Array.isArray(estimate) &&
            Array.isArray(lower) &&
            Array.isArray(upper) &&
            estimate.every((v, i) => lower[i] <= v && v <= upper[i]),
          "Invalid ranked-audit bounds."
        )
      }
    }
    if (run.reference !== undefined) {
      const ref = run.reference
      required(
        record(ref) &&
          typeof ref.kind === "string" &&
          ["fit", "evidence", "forecast", "planner", "audit"].includes(ref.kind) &&
          typeof ref.source === "string" &&
          ref.source.trim().length > 0 &&
          Array.isArray(ref.rows) &&
          ref.rows.length > 0 &&
          ref.rows.every(
            (row) =>
              record(row) &&
              Object.values(row).every(
                (v) => typeof v === "string" || typeof v === "boolean" || Number.isFinite(v)
              )
          ),
        "Invalid reference dataset."
      )
      required(
        ref.kind !== "fit" || (record(run.connection) && run.connection.rows === ref.rows.length),
        "Reference rows do not match the saved fit."
      )
      required(
        ref.kind !== "evidence" ||
          (Array.isArray(run.evidence) && run.evidence.length === ref.rows.length),
        "Missing reference evidence."
      )
    }
    if (run.connection !== undefined) {
      const c = run.connection
      required(
        run.mode === "posterior" &&
          record(c) &&
          typeof c.file === "string" &&
          Number.isSafeInteger(c.rows) &&
          Number(c.rows) > 0 &&
          Number.isSafeInteger(c.divergences) &&
          Number(c.divergences) >= 0 &&
          Array.isArray(c.links) &&
          c.links.length > 0 &&
          record(c.prior),
        "Invalid Parquet connection."
      )
      for (const m of [c.analytic, c.inputs])
        required(
          m === undefined || (record(m) && Object.values(m).every((v) => typeof v === "string")),
          "Invalid connection labels."
        )
      for (const l of c.links)
        required(
          record(l) &&
            typeof l.site === "string" &&
            byId.get(l.site)?.kind === "observed" &&
            typeof l.node === "string" &&
            byId.get(l.site)?.observedFrom === l.node &&
            byId.get(l.node)?.kind === "input" &&
            typeof l.column === "string" &&
            Array.isArray(l.values) &&
            l.values.length === c.rows &&
            l.values.every(Number.isFinite),
          "Invalid connected measurements."
        )
      for (const [id, coords] of Object.entries(c.prior))
        required(
          ids.has(id) &&
            record(coords) &&
            Object.values(coords).every(
              (a) => Array.isArray(a) && a.length > 0 && a.every(Number.isFinite)
            ),
          "Invalid prior comparison draws."
        )
    }
    if (run.fit !== undefined) {
      const f = run.fit
      required(
        record(f) &&
          typeof f.method === "string" &&
          typeof f.origin === "string" &&
          typeof f.note === "string" &&
          record(f.metrics) &&
          Object.values(f.metrics).every(Number.isFinite) &&
          (f.loss === undefined || (Array.isArray(f.loss) && f.loss.every(Number.isFinite))),
        "Invalid historical fit record."
      )
    }
    if (run.mode !== undefined)
      required(
        ["prior", "posterior", "predictive"].includes(String(run.mode)),
        "Unknown draw mode."
      )
    if (run.shapes !== undefined)
      required(
        record(run.shapes) &&
          Object.entries(run.shapes).every(
            ([id, shape]) =>
              ids.has(id) &&
              Array.isArray(shape) &&
              shape.every((n) => Number.isSafeInteger(n) && n >= 0)
          ),
        "Invalid run dimensions."
      )
    if (run.evidence !== undefined) {
      required(
        run.mode === "prior" && Array.isArray(run.evidence),
        "Conditioning requires prior candidates."
      )
      const seen = new Set<string>()
      for (const e of run.evidence) {
        required(
          record(e) &&
            typeof e.site === "string" &&
            byId.get(e.site)?.kind === "observed" &&
            typeof e.coord === "string" &&
            typeof e.label === "string" &&
            typeof e.detail === "string" &&
            Number.isFinite(e.observed) &&
            Array.isArray(e.logLikelihood) &&
            e.logLikelihood.length === run.count &&
            e.logLikelihood.every(Number.isFinite),
          "Invalid observation or likelihood vector."
        )
        const coords = run.values[e.site]
        required(
          record(coords) &&
            Array.isArray(coords[e.coord]) &&
            (coords[e.coord] as number[]).every((v) => v === e.observed),
          "Evidence must match the recorded coordinate."
        )
        const key = JSON.stringify([e.site, e.coord])
        required(!seen.has(key), "The same observation is included twice.")
        seen.add(key)
      }
    }
    if (run.laws !== undefined) {
      required(record(run.laws), "Invalid conditional distributions.")
      for (const [id, law] of Object.entries(run.laws)) {
        required(
          ids.has(id) && record(law) && typeof law.family === "string" && record(law.parameters),
          "Invalid conditional distribution."
        )
        for (const param of Object.values(law.parameters)) {
          required(record(param), "Invalid conditional parameter.")
          for (const values of Object.values(param))
            required(
              Array.isArray(values) && values.length === run.count && values.every(Number.isFinite),
              "Conditional parameters must be aligned finite draws."
            )
        }
      }
    }
    for (const [id, coords] of Object.entries(run.values)) {
      required(
        ids.has(id) && record(coords) && Object.keys(coords).length > 0,
        "Run values must reference known nodes and coordinates."
      )
      for (const a of Object.values(coords))
        required(
          Array.isArray(a) && a.length === run.count && a.every(Number.isFinite),
          "Every coordinate must contain one finite value per draw."
        )
    }
  }
  if (v.experiments !== undefined) {
    required(Array.isArray(v.experiments), "Experiments must be a list.")
    for (const e of v.experiments) {
      required(
        record(e) &&
          [e.title, e.note, e.xLabel, e.yLabel].every((k) => typeof k === "string") &&
          Array.isArray(e.cases) &&
          e.cases.length >= 2,
        "Invalid experiment."
      )
      required(
        e.threshold === undefined || Number.isFinite(e.threshold),
        "Invalid experiment threshold."
      )
      let last = -Infinity,
        count = 0
      for (const c of e.cases) {
        required(
          record(c) &&
            typeof c.x === "number" &&
            Number.isFinite(c.x) &&
            c.x > last &&
            Array.isArray(c.values) &&
            c.values.length > 0 &&
            c.values.every(Number.isFinite) &&
            (!count || c.values.length === count),
          "Scenario inputs must increase and draws must align."
        )
        last = c.x
        count = c.values.length
      }
    }
  }
  return v as unknown as Program
}
export function fmt(x: number) {
  const a = Math.abs(x)
  return a !== 0 && (a < 0.001 || a >= 1e6)
    ? x.toExponential(2)
    : Number(x.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 6 })
}
export function quantile(sorted: number[], p: number) {
  const index = (sorted.length - 1) * p,
    i = Math.floor(index)
  return sorted[i] + (sorted[Math.ceil(index)] - sorted[i]) * (index - i)
}
export function getSeries(run: Run | undefined, id: string, coord?: string) {
  const all = run?.values[id] ?? {},
    keys = Object.keys(all),
    key = coord && Object.hasOwn(all, coord) ? coord : keys[0]
  return { keys, key, values: key ? all[key] : undefined }
}
export function download(program: Program) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(program)], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${program.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.prob.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
