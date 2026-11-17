// Contrast of every text token on every surface, per direction and mode,
// computed from the token values rather than estimated from screenshots.
//   node packages/theme/scripts/contrast.mjs            # table of failures
//   node packages/theme/scripts/contrast.mjs --all      # every pair
// Exits 1 when a text token falls below 4.5:1 on a surface. `faint` is meant
// for decoration and large text only, so it is held to 3:1.
import { readFileSync } from "node:fs"
import { join } from "node:path"

const directions = ["instrument", "editorial", "console"]
const texts = {
  foreground: 4.5,
  "ink-2": 4.5,
  "muted-foreground": 4.5,
  "primary-ink": 4.5,
  // Chart ticks and annotations, 11px.
  "viz-text": 4.5,
  // The low end of score ramps is data, so it must stay visible.
  "viz-ramp-low": 3,
  faint: 3,
}
const surfaces = ["card", "page", "sunken", "muted", "primary-soft"]
const showAll = process.argv.includes("--all")

function luminance(hex) {
  const channel = (i) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function tokens(direction) {
  const css = readFileSync(
    join(import.meta.dirname, "../src/directions", `${direction}.css`),
    "utf8"
  )
  const values = {}
  for (const [, name, value] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const pair = value.match(/^light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i)
    if (pair) values[name] = { light: pair[1], dark: pair[2] }
    else if (/^#[0-9a-f]{6}$/i.test(value.trim()))
      values[name] = { light: value.trim(), dark: value.trim() }
  }
  // Aliases such as `--viz-text: var(--muted-foreground)` take their target's pair.
  for (const [, name, target] of css.matchAll(/--([\w-]+):\s*var\(--([\w-]+)\);/g))
    if (values[target]) values[name] = values[target]
  return values
}

let failures = 0
for (const direction of directions) {
  const values = tokens(direction)
  for (const mode of ["light", "dark"]) {
    for (const [text, minimum] of Object.entries(texts)) {
      for (const surface of surfaces) {
        if (!values[text] || !values[surface]) continue
        const value = ratio(values[text][mode], values[surface][mode])
        const failed = value < minimum
        failures += failed ? 1 : 0
        if (failed || showAll) {
          const mark = failed ? "FAIL" : "ok  "
          console.log(
            `${mark} ${direction.padEnd(10)} ${mode.padEnd(5)} ${text.padEnd(16)} on ${surface.padEnd(12)} ${value.toFixed(2)}:1 (needs ${minimum}:1)`
          )
        }
      }
    }
  }
}
console.log(
  failures
    ? `${failures} text/surface pairs below their minimum`
    : "every text token clears its minimum"
)
process.exit(failures ? 1 : 0)
