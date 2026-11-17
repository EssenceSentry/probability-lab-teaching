import stats from "jstat"
import { type Evidence, fmt, type Law, type Run, type Site } from "./program"

export const inputsOf = (n: Site) => [
  ...new Set([...n.parents, ...(n.observedFrom ? [n.observedFrom] : [])]),
]
export function weightsFor(rows: Evidence[], used: number, count: number) {
  const log = new Float64Array(count)
  for (const row of rows.slice(0, used))
    for (let i = 0; i < count; i++) log[i] += row.logLikelihood[i]
  const peak = log.reduce((a, b) => Math.max(a, b), -Infinity),
    mass = log.map((x) => Math.exp(x - peak)),
    sum = mass.reduce((a, b) => a + b, 0)
  const weights = mass.map((x) => x / sum)
  return { weights, ess: 1 / weights.reduce((s, w) => s + w * w, 0) }
}
export interface Curve {
  name: string
  params: string
  lo: number
  hi: number
  cdf: (x: number) => number
  discrete?: boolean
  point?: number
}
const point = (x: number, name: string, params: string): Curve => ({
  name,
  params,
  lo: x - 0.5,
  hi: x + 0.5,
  cdf: (v) => Number(v >= x),
  point: x,
})
const normal = (m: number, s: number, name: string, params: string): Curve =>
  s > 0
    ? { name, params, lo: m - 3.5 * s, hi: m + 3.5 * s, cdf: (x) => stats.normal.cdf(x, m, s) }
    : point(m, name, params)
export function curveFor(
  law: Law | undefined,
  coord: string,
  draw: number,
  shape: number[]
): Curve | undefined {
  if (!law) return
  const p = Object.fromEntries(
    Object.entries(law.parameters).map(([k, v]) => [k, v[coord]?.[draw]])
  )
  if (Object.values(p).some((x) => !Number.isFinite(x))) return
  const title = law.family
  if (title === "Normal" && p.scale > 0)
    return normal(p.loc, p.scale, title, `μ = ${fmt(p.loc)} · σ = ${fmt(p.scale)}`)
  if (title === "HalfNormal" && p.scale > 0)
    return {
      name: title,
      params: `σ = ${fmt(p.scale)}`,
      lo: 0,
      hi: 3.5 * p.scale,
      cdf: (x) => (x <= 0 ? 0 : 2 * stats.normal.cdf(x, 0, p.scale) - 1),
    }
  if (title === "LogNormal" && p.scale > 0)
    return {
      name: title,
      params: `log μ = ${fmt(p.loc)} · σ = ${fmt(p.scale)}`,
      lo: 0,
      hi: Math.exp(p.loc + 2.5 * p.scale),
      cdf: (x) => (x <= 0 ? 0 : stats.lognormal.cdf(x, p.loc, p.scale)),
    }
  if (title === "StudentT" && p.scale > 0 && p.df > 0)
    return {
      name: title,
      params: `ν ${fmt(p.df)} · μ ${fmt(p.loc)} · σ ${fmt(p.scale)}`,
      lo: p.loc - 5 * p.scale,
      hi: p.loc + 5 * p.scale,
      cdf: (x) => stats.studentt.cdf((x - p.loc) / p.scale, p.df),
    }
  if (title === "Beta" && p.concentration0 > 0 && p.concentration1 > 0)
    return {
      name: title,
      params: `α = ${fmt(p.concentration1)} · β = ${fmt(p.concentration0)}`,
      lo: 0,
      hi: 1,
      cdf: (x) => stats.beta.cdf(x, p.concentration1, p.concentration0),
    }
  if (title === "Gamma" && p.rate > 0 && p.concentration > 0)
    return {
      name: title,
      params: `shape ${fmt(p.concentration)} · rate ${fmt(p.rate)}`,
      lo: 0,
      hi: (p.concentration + 4 * Math.sqrt(p.concentration)) / p.rate,
      cdf: (x) => stats.gamma.cdf(x, p.concentration, 1 / p.rate),
    }
  if (
    title.startsWith("Binomial") &&
    p.total_count >= 0 &&
    Number.isInteger(p.total_count) &&
    p.probs >= 0 &&
    p.probs <= 1
  )
    return {
      name: "Binomial",
      params: `n = ${p.total_count} · p = ${fmt(p.probs)}`,
      lo: -0.5,
      hi: p.total_count + 0.5,
      discrete: true,
      cdf: (x) => stats.binomial.cdf(Math.floor(x), p.total_count, p.probs),
    }
  const indices = coord.match(/\d+/g)?.map(Number) ?? []
  if (title === "GaussianRandomWalk" && p.scale > 0) {
    const t = (indices.at(-1) ?? 0) + 1
    return normal(
      0,
      p.scale * Math.sqrt(t),
      "Gaussian walk · coordinate marginal",
      `step ${t} · innovation σ ${fmt(p.scale)}`
    )
  }
  if (title === "LKJCholesky" && shape.at(-1) === 2 && p.concentration > 0) {
    const eta = p.concentration,
      [r, c] = indices.slice(-2),
      params = `η = ${fmt(eta)} · L[${r},${c}]`
    if (r === 0) return point(c === 0 ? 1 : 0, "LKJ · fixed entry", params)
    if (r === 1 && c === 0)
      return {
        name: "LKJ · marginal",
        params,
        lo: -1,
        hi: 1,
        cdf: (x) => stats.beta.cdf((x + 1) / 2, eta, eta),
      }
    if (r === 1 && c === 1)
      return {
        name: "LKJ · marginal",
        params,
        lo: 0,
        hi: 1,
        cdf: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : stats.beta.cdf(x * x, eta, 0.5)),
      }
  }
}
export interface Bin {
  lo: number
  hi: number
  mid: number
  empirical: number
  theory: number
  weighted: number
  fullEmpirical: number
  reference: number
  fullWeighted: number
}
export function distributionBins(
  samples: number[],
  curve: Curve | undefined,
  marker: number | undefined,
  weights?: Float64Array,
  visible = samples.length,
  reference?: number[],
  discrete = false
) {
  const bounds = samples.reduce(
    ([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)],
    [Infinity, -Infinity]
  )
  for (const v of reference ?? []) {
    bounds[0] = Math.min(bounds[0], v)
    bounds[1] = Math.max(bounds[1], v)
  }
  let lo = Math.min(bounds[0], curve?.lo ?? Infinity, marker ?? Infinity),
    hi = Math.max(bounds[1], curve?.hi ?? -Infinity, marker ?? -Infinity)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0
    hi = 1
  }
  if (hi === lo) {
    const pad = Math.max(0.05, Math.abs(lo) * 0.03)
    lo -= pad
    hi += pad
  }
  const integers = (curve?.discrete || discrete) && hi - lo <= 80
  if (integers) {
    lo = Math.floor(lo + 0.5) - 0.5
    hi = Math.ceil(hi - 0.5) + 0.5
  }
  const count = integers ? Math.max(1, Math.round(hi - lo)) : 32,
    width = (hi - lo) / count
  const bins: Bin[] = Array.from({ length: count }, (_, i) => {
    const a = lo + i * width,
      b = i + 1 === count ? hi : lo + (i + 1) * width
    const diff = curve ? curve.cdf(b) - curve.cdf(a) : 0
    return {
      lo: a,
      hi: b,
      mid: (a + b) / 2,
      empirical: 0,
      theory: Number.isFinite(diff) ? Math.min(1, Math.max(0, diff)) : 0,
      weighted: 0,
      fullEmpirical: 0,
      fullWeighted: 0,
      reference: 0,
    }
  })
  for (let i = 0; i < samples.length; i++) {
    const index = Math.max(0, Math.min(count - 1, Math.floor((samples[i] - lo) / width)))
    const bin = bins[index]
    bin.fullEmpirical += 1 / samples.length
    bin.fullWeighted += weights?.[i] ?? 0
    if (i < visible) {
      bin.empirical += 1 / samples.length
      bin.weighted += weights?.[i] ?? 0
    }
  }
  if (reference?.length)
    for (const v of reference) {
      const index = Math.max(0, Math.min(count - 1, Math.floor((v - lo) / width)))
      bins[index].reference += 1 / reference.length
    }
  return bins
}
export const runShape = (run: Run | undefined, n: Site) => run?.shapes?.[n.id] ?? n.shape
