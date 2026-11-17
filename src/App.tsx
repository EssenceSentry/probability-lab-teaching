import { useState } from "react"
import { AppIcon } from "./app-icon"
import { download, readProgram } from "./lib/program"
import coin from "./programs/coin.json"
import pooling from "./programs/pooling.json"
import { TraceCanvas } from "./screens/trace-canvas"
import "./screens/trace.css"

const programs = { coin: readProgram(coin), pooling: readProgram(pooling) }
type Model = keyof typeof programs

export default function App() {
  const [model, setModel] = useState<Model>(() =>
    new URLSearchParams(location.search).get("model") === "pooling" ? "pooling" : "coin"
  )
  const program = programs[model]
  function chooseModel(value: string) {
    if (value !== "coin" && value !== "pooling") return
    const url = new URL(location.href)
    url.searchParams.set("model", value)
    history.replaceState(null, "", url)
    setModel(value)
  }

  return (
    <main className="canvas-explorer">
      <h1 className="sr-only">Probability Lab · {program.name}</h1>
      <TraceCanvas key={model} program={program} toolbar={{
        picker: (
          <>
            <span className="explorer-mark" title="Probability Lab"><AppIcon /></span>
            <label htmlFor="teaching-model">Model</label>
            <select id="teaching-model" className="explorer-picker" value={model}
              onChange={event => chooseModel(event.target.value)}>
              <option value="coin">Coin tosses</option>
              <option value="pooling">Partial pooling</option>
            </select>
          </>
        ),
        actions: <button type="button" onClick={() => download(program)}>Download this program</button>,
      }} />
    </main>
  )
}
