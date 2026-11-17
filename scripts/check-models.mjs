import { readFile } from "node:fs/promises"
import { readProgram } from "../src/lib/program.ts"

for (const name of ["coin", "pooling"]) {
  const file = new URL(`../src/programs/${name}.json`, import.meta.url)
  const program = readProgram(JSON.parse(await readFile(file, "utf8")))
  console.log(`${name}: validated ${program.nodes.length} nodes and ${program.runs.length} saved runs`)
}
