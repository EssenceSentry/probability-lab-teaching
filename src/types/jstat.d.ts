declare module "jstat" {
  interface Distribution {
    cdf: (x: number, ...parameters: number[]) => number
  }
  const stats: Record<
    "normal" | "studentt" | "gamma" | "beta" | "lognormal" | "binomial",
    Distribution
  >
  export default stats
}
