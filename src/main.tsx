import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@atelier/theme/direction.css"
import "./index.css"
import App from "./App.tsx"

const root = document.getElementById("root")
if (!root) throw new Error("index.html needs an element with id root")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
