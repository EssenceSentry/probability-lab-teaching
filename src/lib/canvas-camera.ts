import {
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

type Point = { x: number; y: number }
type Camera = { scale: number; left: number; top: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export const canvasInset = (viewport: number, world: number, scale: number) =>
  Math.max(0, (viewport - world * scale) / 2)
export function useCanvasCamera(
  viewport: RefObject<HTMLDivElement | null>,
  onNavigate: () => void,
  worldWidth: number,
  worldHeight: number
) {
  const [zoom, setZoom] = useState(0.96)
  const current = useRef(zoom),
    pending = useRef<Camera | null>(null)
  const points = useRef(new Map<number, Point>()),
    initial = useRef<Point | null>(null),
    dragged = useRef(false)

  // Map the world point at 'from' back under 'to' after scaling. Pointer
  // pairs can translate and pinch in the same event.
  const transform = useCallback(
    (scale: number, from?: Point, to = from) => {
      const el = viewport.current
      if (!el || !Number.isFinite(scale) || scale <= 0) return
      const rect = el.getBoundingClientRect()
      const a = from ?? { x: rect.left + el.clientWidth / 2, y: rect.top + el.clientHeight / 2 },
        b = to ?? a
      const old = pending.current ?? {
        scale: current.current,
        left: el.scrollLeft,
        top: el.scrollTop,
      }
      const camera = {
        scale,
        left:
          ((old.left + a.x - rect.left - canvasInset(el.clientWidth, worldWidth, old.scale)) *
            scale) /
            old.scale +
          canvasInset(el.clientWidth, worldWidth, scale) -
          (b.x - rect.left),
        top:
          ((old.top + a.y - rect.top - canvasInset(el.clientHeight, worldHeight, old.scale)) *
            scale) /
            old.scale +
          canvasInset(el.clientHeight, worldHeight, scale) -
          (b.y - rect.top),
      }
      onNavigate()
      if (scale === current.current) {
        pending.current = null
        el.scrollTo(camera.left, camera.top)
      } else {
        pending.current = camera
      }
      setZoom(scale)
    },
    [onNavigate, viewport, worldWidth, worldHeight]
  )
  useLayoutEffect(() => {
    current.current = zoom
    const camera = pending.current
    if (camera && camera.scale === zoom) {
      viewport.current?.scrollTo(camera.left, camera.top)
      pending.current = null
    }
  }, [zoom, viewport])
  const zoomBy = useCallback(
    (factor: number, from?: Point, to = from) => {
      const previous = pending.current?.scale ?? current.current
      transform(Math.max(Math.min(0.12, previous), Math.min(4, previous * factor)), from, to)
    },
    [transform]
  )
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    let nativeScale: number | null = null
    function wheel(e: WheelEvent) {
      if (e.shiftKey && !e.ctrlKey) return
      e.preventDefault()
      if (nativeScale !== null || points.current.size > 1) return
      const dy =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (el?.clientHeight ?? 600) : 1)
      if (dy) zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025)), { x: e.clientX, y: e.clientY })
      else if (e.deltaX && el) {
        onNavigate()
        el.scrollLeft += e.deltaX
      }
    }
    // Safari trackpads can emit native gesture events rather than ctrl-wheel.
    const gesture = (event: Event) => {
      const e = event as Event & { scale: number; clientX?: number; clientY?: number }
      e.preventDefault()
      if (e.type === "gestureend" || points.current.size > 1) {
        nativeScale = null
        return
      }
      if (e.type === "gesturestart") {
        nativeScale = e.scale || 1
        return
      }
      if (nativeScale === null || !(e.scale > 0)) return
      const point =
        typeof e.clientX === "number" && typeof e.clientY === "number"
          ? { x: e.clientX, y: e.clientY }
          : undefined
      zoomBy(e.scale / nativeScale, point)
      nativeScale = e.scale
    }
    el.addEventListener("wheel", wheel, { passive: false })
    for (const name of ["gesturestart", "gesturechange", "gestureend"])
      el.addEventListener(name, gesture, { passive: false })
    return () => {
      el.removeEventListener("wheel", wheel)
      for (const name of ["gesturestart", "gesturechange", "gestureend"])
        el.removeEventListener(name, gesture)
    }
  }, [zoomBy, onNavigate, viewport])

  function pointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const point = { x: e.clientX, y: e.clientY },
      active = points.current
    if (!active.size) {
      initial.current = point
      dragged.current = false
    }
    active.set(e.pointerId, point)
    if (active.size >= 2) {
      dragged.current = true
      for (const id of active.keys()) e.currentTarget.setPointerCapture(id)
    }
  }
  function pointerMove(e: PointerEvent<HTMLDivElement>) {
    const active = points.current,
      old = active.get(e.pointerId)
    if (!old) return
    if (e.pointerType === "mouse" && e.buttons === 0) {
      active.delete(e.pointerId)
      return
    }
    const next = { x: e.clientX, y: e.clientY }
    if (active.size === 1) {
      const start = initial.current ?? old
      if (!dragged.current && distance(next, start) < 4) return
      const from = dragged.current ? old : start
      dragged.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      transform(pending.current?.scale ?? current.current, from, next)
    } else {
      const pair = [...active.keys()].slice(0, 2)
      if (pair.includes(e.pointerId)) {
        const other = active.get(pair[0] === e.pointerId ? pair[1] : pair[0]) as Point
        const before = distance(old, other),
          after = distance(next, other)
        if (before > 1 && after > 1) zoomBy(after / before, middle(old, other), middle(next, other))
      }
    }
    active.set(e.pointerId, next)
  }
  function endPointer(e: PointerEvent<HTMLDivElement>) {
    points.current.delete(e.pointerId)
    initial.current = points.current.values().next().value ?? null
  }
  function clickCapture(e: MouseEvent<HTMLDivElement>) {
    if (dragged.current && e.detail > 0) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  return {
    zoom,
    zoomBy,
    zoomTo: transform,
    gestures: {
      onPointerDown: pointerDown,
      onPointerMove: pointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onLostPointerCapture: (e: PointerEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) endPointer(e)
      },
      onPointerLeave: (e: PointerEvent<HTMLDivElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) endPointer(e)
      },
      onClickCapture: clickCapture,
    },
  }
}
