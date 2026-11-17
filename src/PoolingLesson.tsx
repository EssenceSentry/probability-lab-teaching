import { useState } from "react"
import { quantile, type Program } from "./lib/program"

export function PoolingLesson({program}: {program: Program}) {
  const [draw, setDraw] = useState(0)
  const run = program.runs[0]
  const rows = Object.entries(run.values.location).map(([coord, locations]) => {
    const sorted = [...locations].sort((a,b) => a-b)
    return {
      coord, n: run.values.input_counts[coord][0],
      observed: run.values.input_observed[coord][0],
      estimate: locations.reduce((sum,v) => sum+v,0)/locations.length,
      interval: [quantile(sorted,0.05), quantile(sorted,0.95)],
      location: locations[draw], predicted: run.values.group_mean__rep[coord][draw],
    }
  })
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-3xl font-semibold">How much should we trust a group of two?</h1>
      <p className="my-5 max-w-prose">Groups A and B both average 0.60. A has two observations and B has forty.
        Fitting them independently gives the same point estimate. A shared population lets the two groups borrow different amounts of information.</p>
      <section aria-labelledby="estimates">
        <h2 id="estimates" className="mt-8 text-xl font-semibold">Compare the estimates</h2>
        <div className="overflow-x-auto">
          <table className="lesson-table"><caption className="sr-only">Estimates from three synthetic groups</caption>
            <thead><tr>{["Group","Observations","Independent mean","Pooled mean","Pooled 90% interval"].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=><tr key={r.coord}><th scope="row">{String.fromCharCode(65+i)}</th><td>{r.n}</td><td>{r.observed.toFixed(2)}</td><td>{r.estimate.toFixed(2)}</td><td>{r.interval.map(v=>v.toFixed(2)).join(" to ")}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="prediction">
        <h2 id="prediction" className="mt-8 text-xl font-semibold">Follow one draw into a prediction</h2>
        <p className="my-3 max-w-prose">Every row uses the same draw of the population center. The last column adds observation noise for a repeat group of the same size.</p>
        <label htmlFor="draw">Draw {draw+1} of {run.count}</label>
        <input className="block w-full max-w-lg my-3" id="draw" type="range" min="1" max={run.count} value={draw+1} onChange={e=>setDraw(Number(e.target.value)-1)} />
        <p>Population center for this draw: <strong>{run.values.population.Scalar[draw].toFixed(2)}</strong></p>
        <table className="lesson-table"><thead><tr><th scope="col">Group</th><th scope="col">Sampled group location</th><th scope="col">Predicted repeat mean</th></tr></thead>
          <tbody>{rows.map((r,i)=><tr key={r.coord}><th scope="row">{String.fromCharCode(65+i)}</th><td>{r.location.toFixed(2)}</td><td>{r.predicted.toFixed(2)}</td></tr>)}</tbody>
        </table>
      </section>
      <p className="mt-8 max-w-prose">All observations are synthetic. The pooled estimates and central intervals summarize {run.count} saved draws from the exact Gaussian posterior.</p>
      <a className="mt-4 inline-block underline" href="?model=pooling">Inspect the model graph →</a>
    </main>
  )
}
