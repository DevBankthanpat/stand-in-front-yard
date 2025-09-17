'use client'

import React, { JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect, Circle, Text as KonvaText, Image as KonvaImage, Transformer, Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import Konva from 'konva'

type BaseShape = {
  id: string
  x: number
  y: number
  rotation: number
  name?: string
  locked?: boolean
  hidden?: boolean
}

type RectShape = BaseShape & {
  kind: 'rect'
  width: number
  height: number
  fill: string
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
}

type CircleShape = BaseShape & {
  kind: 'circle'
  radius: number
  fill: string
  stroke?: string
  strokeWidth?: number
}

type TextShape = BaseShape & {
  kind: 'text'
  text: string
  fontSize: number
  width?: number
  fill: string
}

type ImageShape = BaseShape & {
  kind: 'image'
  width: number
  height: number
  src: string
}

type Shape = RectShape | CircleShape | TextShape | ImageShape

type ShapeUpdater = (prev: Shape[]) => Shape[]
 
const SLIDE_W = 1920
const SLIDE_H = 1080

// Local storage key
const LS_KEY = 'single-slide-mvp'

// ---------- Helpers ----------

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function useResizeObserver<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      setSize({ width: cr.width, height: cr.height })
    })
    ro.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  return { ref, size }
}
 
const imageCache = new Map<string, HTMLImageElement>()
async function loadImage(src: string): Promise<HTMLImageElement> {
  if (imageCache.has(src)) return imageCache.get(src) as HTMLImageElement
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageCache.set(src, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = src
  })
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const toNum = (v: string, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// ---------- Component ----------

export default function SingleSlideEditorMVP() {
  const stageRef = useRef<Konva.Stage | null>(null)
  const trRef = useRef<Konva.Transformer | null>(null)
  const selectedNodeRef = useRef<Konva.Node | null>(null)
  const container = useResizeObserver<HTMLDivElement>()
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)

  const [shapes, setShapes] = useState<Shape[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPanMode, setIsPanMode] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [history, setHistory] = useState<Shape[][]>([])
  const [future, setFuture] = useState<Shape[][]>([])

  const [showInspector, setShowInspector] = useState(true)
  const [gridEnabled, setGridEnabled] = useState(true)
  const [gridVisible, setGridVisible] = useState(false)
  const [gridSize, setGridSize] = useState(32)

  // ---------- Persistence ----------
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      try {
        const saved = JSON.parse(raw) as { shapes: Shape[] }
        setShapes(saved.shapes)
      } catch {}
    }
  }, [])
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ shapes }))
  }, [shapes])

  // ---------- Fit to screen ----------
  const fitToScreen = useCallback(() => {
    const { width, height } = container.size
    if (!width || !height) return
    const scaleX = width / SLIDE_W
    const scaleY = height / SLIDE_H
    const nextScale = Math.min(scaleX, scaleY)
    setScale(nextScale)
    setOffset({ x: (width - SLIDE_W * nextScale) / 2, y: (height - SLIDE_H * nextScale) / 2 })
  }, [container.size])

  useEffect(() => { fitToScreen() }, [fitToScreen])

  // ---------- History ----------
  const commit = useCallback((next: Shape[] | ShapeUpdater) => {
    setShapes((prev) => {
      const resolved = typeof next === 'function' ? (next as ShapeUpdater)(prev) : next
      setHistory((h) => [...h.slice(-49), prev])
      setFuture([])
      return structuredClone(resolved)
    })
  }, [])

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      setFuture((f) => [shapes, ...f].slice(0, 50))
      setShapes(h[h.length - 1])
      return h.slice(0, -1)
    })
    setSelectedId(null)
  }, [shapes])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      setHistory((h) => [...h, shapes].slice(-50))
      setShapes(f[0])
      return f.slice(1)
    })
    setSelectedId(null)
  }, [shapes])

  // ---------- Add shapes ----------
  const addRect = () => {
    const s: RectShape = {
      kind: 'rect', id: uid('rect'), name: 'Rectangle', x: 200, y: 150, width: 320, height: 180, rotation: 0, fill: '#ffd166', stroke: '#111827', strokeWidth: 2, cornerRadius: 12
    }
    commit((prev) => [...prev, s]); setSelectedId(s.id)
  }
  const addCircle = () => {
    const s: CircleShape = {
      kind: 'circle', id: uid('circle'), name: 'Circle', x: 500, y: 300, radius: 100, rotation: 0, fill: '#a7f3d0', stroke: '#111827', strokeWidth: 2
    }
    commit((prev) => [...prev, s]); setSelectedId(s.id)
  }
  const addText = () => {
    const s: TextShape = {
      kind: 'text', id: uid('text'), name: 'Text', x: 240, y: 180, text: 'Double‑tap to edit', fontSize: 40, rotation: 0, fill: '#111827', width: 600
    }
    commit((prev) => [...prev, s]); setSelectedId(s.id)
  }
  const onImageUpload = async (file: File) => {
    const url = URL.createObjectURL(file)
    const img = await loadImage(url)
    const s: ImageShape = { kind: 'image', id: uid('img'), name: 'Image', x: 260, y: 220, width: Math.min(600, img.width), height: Math.min(400, img.height), src: url, rotation: 0 }
    commit((prev) => [...prev, s]); setSelectedId(s.id)
  }

  // ---------- Selection & transform ----------
  const deselect = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const clickedOnEmpty = e.target === e.target.getStage()
    if (clickedOnEmpty) setSelectedId(null)
  }

  useEffect(() => {
    const stage = stageRef.current
    const tr = trRef.current
    if (!stage || !tr) return
    const selectedNode = selectedId ? stage.findOne(`#${selectedId}`) : null
    selectedNodeRef.current = selectedNode ?? null
    tr.nodes(selectedNode ? [selectedNode] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, shapes])

  const updateShape = (id: string, partial: Partial<Shape>) => {
    commit((prev) => prev.map((s) => (s.id === id ? { ...s, ...partial } as Shape : s)))
  }

  const deleteSelected = () => {
    if (!selectedId) return
    commit((prev) => prev.filter((s) => s.id !== selectedId))
    setSelectedId(null)
  }

  // ---------- Keyboard (desktop) ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key
      const mod = e.ctrlKey || e.metaKey
      const delta = e.shiftKey ? 10 : 1

      if (mod && key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
      if (mod && key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (selectedId) {
        if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); deleteSelected(); return }
        if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
          e.preventDefault()
          const s = shapes.find((x) => x.id === selectedId)
          if (!s || s.locked) return
          const dx = key === 'ArrowLeft' ? -delta : key === 'ArrowRight' ? delta : 0
          const dy = key === 'ArrowUp' ? -delta : key === 'ArrowDown' ? delta : 0
          const nx = gridEnabled ? Math.round((s.x + dx) / gridSize) * gridSize : s.x + dx
          const ny = gridEnabled ? Math.round((s.y + dy) / gridSize) * gridSize : s.y + dy
          updateShape(s.id, { x: nx, y: ny })
        }
      }
      if (e.code === 'Space') setIsPanMode(true)
    }
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsPanMode(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
  }, [selectedId, shapes, undo, redo, gridEnabled, gridSize])

  // ---------- Zoom ----------
  const zoomBy = (factor: number, center?: { x: number; y: number }) => {
    const stage = stageRef.current
    if (!stage) return
    const pointer = center ?? stage.getPointerPosition() ?? { x: container.size.width / 2, y: container.size.height / 2 }
    const oldScale = scale
    const mousePointTo = { x: (pointer.x - offset.x) / oldScale, y: (pointer.y - offset.y) / oldScale }
    const newScale = clamp(oldScale * factor, 0.1, 4)
    const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale }
    setScale(newScale); setOffset(newPos)
  }

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const factor = e.evt.deltaY > 0 ? 0.9 : 1.1
    zoomBy(factor, { x: e.evt.clientX, y: e.evt.clientY })
  }

  // ---------- Export ----------
  const exportPNG = () => {
    const stage = stageRef.current
    if (!stage) return
    const dataURL = stage.toDataURL({ pixelRatio: 2 })
    const a = document.createElement('a')
    a.href = dataURL
    a.download = 'slide.png'
    a.click()
  }

  // ---------- Stage drag (Pan) ----------
  const [isDraggingStage, setIsDraggingStage] = useState(false)
  const onStageMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isPanMode) setIsDraggingStage(true)
    deselect(e)
  }
  const onStageMouseUp = () => setIsDraggingStage(false)
  const onStageDragMove = (e: KonvaEventObject<DragEvent>) => {
    if (!isDraggingStage) return
    const movementX = (e.evt as MouseEvent).movementX ?? 0
    const movementY = (e.evt as MouseEvent).movementY ?? 0
    setOffset((p) => ({ x: p.x + movementX, y: p.y + movementY }))
  }

  // ---------- Grid ----------
  const snap = useCallback((n: number) => (gridEnabled ? Math.round(n / gridSize) * gridSize : n), [gridEnabled, gridSize])

  const GridLayer: React.FC = () => {
    const lines = useMemo(() => {
      if (!gridVisible) return null
      const vertical: JSX.Element[] = []
      const horizontal: JSX.Element[] = []
      for (let x = 0; x <= SLIDE_W; x += gridSize) {
        vertical.push(
          <Line key={`v-${x}`} points={[x, 0, x, SLIDE_H]} stroke="#e5e7eb" strokeWidth={1} listening={false} />
        )
      }
      for (let y = 0; y <= SLIDE_H; y += gridSize) {
        horizontal.push(
          <Line key={`h-${y}`} points={[0, y, SLIDE_W, y]} stroke="#e5e7eb" strokeWidth={1} listening={false} />
        )
      }
      return (
        <>
          {vertical}
          {horizontal}
        </>
      )
    }, [gridVisible, gridSize])
    return lines
  }

  // ---------- Alignment ----------
  const alignSelected = (dir: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') => {
    if (!selectedId) return
    const s = shapes.find((x) => x.id === selectedId)
    if (!s) return
    const getSize = (sh: Shape) => {
      if (sh.kind === 'rect' || sh.kind === 'image') return { w: sh.width, h: sh.height }
      if (sh.kind === 'circle') return { w: sh.radius * 2, h: sh.radius * 2 } 
      return { w: sh.width ?? 300, h: sh.fontSize * 1.2 }
    }
    const { w, h } = getSize(s)
    let nx = s.x, ny = s.y
    if (dir === 'left') nx = 0
    if (dir === 'centerX') nx = (SLIDE_W - w) / 2
    if (dir === 'right') nx = SLIDE_W - w
    if (dir === 'top') ny = 0
    if (dir === 'centerY') ny = (SLIDE_H - h) / 2
    if (dir === 'bottom') ny = SLIDE_H - h
    updateShape(s.id, { x: snap(nx), y: snap(ny) })
  }

  // ---------- Layer ops ----------
  const bringForward = (id: string) => {
    commit((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0 || idx === prev.length - 1) return prev
      const next = prev.slice()
      const tmp = next[idx]
      next[idx] = next[idx + 1]
      next[idx + 1] = tmp
      return next
    })
  }
  const sendBackward = (id: string) => {
    commit((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx <= 0) return prev
      const next = prev.slice()
      const tmp = next[idx]
      next[idx] = next[idx - 1]
      next[idx - 1] = tmp
      return next
    })
  }
  const bringToFront = (id: string) => {
    commit((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0 || idx === prev.length - 1) return prev
      const next = prev.slice()
      const [item] = next.splice(idx, 1)
      next.push(item)
      return next
    })
  }
  const sendToBack = (id: string) => {
    commit((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx <= 0) return prev
      const next = prev.slice()
      const [item] = next.splice(idx, 1)
      next.unshift(item)
      return next
    })
  }

  // ---------- UI ----------
  const hiddenFile = useRef<HTMLInputElement | null>(null)

  const Toolbar = () => (
    <div className="flex flex-wrap items-center gap-2 p-2 border-b bg-white/80 backdrop-blur sticky top-0 z-10">
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={addText}>Text</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={addRect}>Rect</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={addCircle}>Circle</button>

      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={() => hiddenFile.current?.click()}>Image…</button>
      <input ref={hiddenFile} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (f) onImageUpload(f); e.currentTarget.value = ''
      }} />

      <div className="mx-2 h-6 w-px bg-gray-300" />

      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={undo} disabled={history.length === 0}>Undo</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={redo} disabled={future.length === 0}>Redo</button>
      <button className={`px-3 py-1.5 rounded-xl border text-sm ${isPanMode ? 'bg-gray-900 text-white' : ''}`} onClick={() => setIsPanMode((v) => !v)}>Pan {isPanMode ? 'On' : 'Off'}</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={() => zoomBy(1.1)}>Zoom +</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={() => zoomBy(0.9)}>Zoom −</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={fitToScreen}>Fit</button>

      <div className="mx-2 h-6 w-px bg-gray-300" />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={gridEnabled} onChange={(e) => setGridEnabled(e.target.checked)} /> Snap
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={gridVisible} onChange={(e) => setGridVisible(e.target.checked)} /> Grid
      </label>
      <label className="flex items-center gap-1 text-sm">
        Size
        <input className="w-16 border rounded px-2 py-1 text-sm" type="number" min={2} max={256} value={gridSize} onChange={(e) => setGridSize(clamp(toNum(e.target.value, gridSize), 2, 256))} />
      </label>

      <div className="mx-2 h-6 w-px bg-gray-300" />

      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={() => setShowInspector((v) => !v)}>{showInspector ? 'Hide' : 'Show'} Inspector</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={deleteSelected} disabled={!selectedId}>Delete</button>
      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={exportPNG}>Export PNG</button>

      <div className="ml-auto text-xs text-gray-600">Scale: {(scale * 100).toFixed(0)}%</div>
    </div>
  )

  // ---------- Inspector ----------
  const SelectedInspector: React.FC = () => {
    if (!selectedId) return <div className="text-sm text-gray-500 p-2">No selection</div>
    const s = shapes.find((x) => x.id === selectedId)
    if (!s) return null

    const common = (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-gray-600">Name</label>
          <input className="border rounded px-2 py-1 text-sm w-40" value={s.name ?? ''} onChange={(e) => updateShape(s.id, { name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">X
            <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.x} onChange={(e) => updateShape(s.id, { x: toNum(e.target.value, s.x) })} />
          </label>
          <label className="text-xs text-gray-600">Y
            <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.y} onChange={(e) => updateShape(s.id, { y: toNum(e.target.value, s.y) })} />
          </label>
          <label className="text-xs text-gray-600">Rotation
            <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.rotation} onChange={(e) => updateShape(s.id, { rotation: toNum(e.target.value, s.rotation) })} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 flex items-center gap-1">
            <input type="checkbox" checked={!!s.locked} onChange={(e) => updateShape(s.id, { locked: e.target.checked })} /> Lock
          </label>
          <label className="text-xs text-gray-600 flex items-center gap-1">
            <input type="checkbox" checked={!!s.hidden} onChange={(e) => updateShape(s.id, { hidden: e.target.checked })} /> Hide
          </label>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <button className="border rounded px-2 py-1 text-xs" onClick={() => alignSelected('left')}>⟸ L</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => alignSelected('centerX')}>⟷ C</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => alignSelected('right')}>R ⟹</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => alignSelected('top')}>⬆ T</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => alignSelected('centerY')}>↕ M</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => alignSelected('bottom')}>B ⬇</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => bringToFront(s.id)}>Front</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => sendToBack(s.id)}>Back</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => bringForward(s.id)}>Up</button>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => sendBackward(s.id)}>Down</button>
        </div>
      </div>
    )

    const specific = (() => {
      if (s.kind === 'rect') return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">W
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.width} onChange={(e) => updateShape(s.id, { width: Math.max(1, toNum(e.target.value, s.width)) })} />
            </label>
            <label className="text-xs text-gray-600">H
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.height} onChange={(e) => updateShape(s.id, { height: Math.max(1, toNum(e.target.value, s.height)) })} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">Corner
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.cornerRadius ?? 0} onChange={(e) => updateShape(s.id, { cornerRadius: clamp(toNum(e.target.value, s.cornerRadius ?? 0), 0, 200) })} />
            </label>
            <label className="text-xs text-gray-600">Stroke
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.strokeWidth ?? 0} onChange={(e) => updateShape(s.id, { strokeWidth: clamp(toNum(e.target.value, s.strokeWidth ?? 0), 0, 40) })} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">Fill
              <input className="w-full" type="color" value={s.fill} onChange={(e) => updateShape(s.id, { fill: e.target.value })} />
            </label>
            <label className="text-xs text-gray-600">Stroke
              <input className="w-full" type="color" value={s.stroke ?? '#000000'} onChange={(e) => updateShape(s.id, { stroke: e.target.value })} />
            </label>
          </div>
        </div>
      )
      if (s.kind === 'circle') return (
        <div className="space-y-2">
          <label className="text-xs text-gray-600">Radius
            <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.radius} onChange={(e) => updateShape(s.id, { radius: Math.max(1, toNum(e.target.value, s.radius)) })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">Fill
              <input className="w-full" type="color" value={s.fill} onChange={(e) => updateShape(s.id, { fill: e.target.value })} />
            </label>
            <label className="text-xs text-gray-600">Stroke
              <input className="w-full" type="color" value={s.stroke ?? '#000000'} onChange={(e) => updateShape(s.id, { stroke: e.target.value })} />
            </label>
          </div>
          <label className="text-xs text-gray-600">Stroke width
            <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.strokeWidth ?? 0} onChange={(e) => updateShape(s.id, { strokeWidth: clamp(toNum(e.target.value, s.strokeWidth ?? 0), 0, 40) })} />
          </label>
        </div>
      )
      if (s.kind === 'text') return (
        <div className="space-y-2">
          <label className="text-xs text-gray-600">Text
            <textarea className="w-full border rounded px-2 py-1 text-sm" rows={3} value={s.text} onChange={(e) => updateShape(s.id, { text: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">Font size
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.fontSize} onChange={(e) => updateShape(s.id, { fontSize: Math.max(1, toNum(e.target.value, s.fontSize)) })} />
            </label>
            <label className="text-xs text-gray-600">Box width
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.width ?? 300} onChange={(e) => updateShape(s.id, { width: Math.max(50, toNum(e.target.value, s.width ?? 300)) })} />
            </label>
          </div>
          <label className="text-xs text-gray-600">Color
            <input className="w-full" type="color" value={s.fill} onChange={(e) => updateShape(s.id, { fill: e.target.value })} />
          </label>
        </div>
      )
      // image
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">W
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.width} onChange={(e) => updateShape(s.id, { width: Math.max(1, toNum(e.target.value, s.width)) })} />
            </label>
            <label className="text-xs text-gray-600">H
              <input className="w-full border rounded px-2 py-1 text-sm" type="number" value={s.height} onChange={(e) => updateShape(s.id, { height: Math.max(1, toNum(e.target.value, s.height)) })} />
            </label>
          </div>
          <button className="border rounded px-2 py-1 text-xs" onClick={() => hiddenFile.current?.click()}>Replace image…</button>
        </div>
      )
    })()

    return (
      <div className="space-y-4">
        {common}
        {specific}
      </div>
    )
  }

  // ---------- Shape nodes ----------
  const SlideBackground = () => (
    <Rect x={0} y={0} width={SLIDE_W} height={SLIDE_H} fill="#ffffff" stroke="#e5e7eb" strokeWidth={2} cornerRadius={16} listening={false} />
  ) 
 
function useHtmlImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { if (!cancelled) setImg(image); };
    image.onerror = () => { if (!cancelled) setImg(null); };
    image.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return img;
}

type ImageNodeProps = {
  s: ImageShape;
  isPanMode: boolean;
  isSelected: boolean;
  trRef: React.RefObject<Konva.Transformer | null>;
  snap: (n: number) => number;
  setSelectedId: (id: string) => void;
  updateShape: (id: string, partial: Partial<Shape>) => void;
};

const ImageNode: React.FC<ImageNodeProps> = ({
  s, isPanMode, isSelected, trRef, snap, setSelectedId, updateShape,
}) => {
  const img = useHtmlImage(s.src);

  return (
    <>
      <KonvaImage
        id={s.id}
        x={s.x}
        y={s.y}
        width={s.width}
        height={s.height}
        rotation={s.rotation}
        draggable={!isPanMode && !s.locked}
        listening={!s.locked}
        image={img ?? undefined}
        onClick={() => setSelectedId(s.id)}
        onTap={() => setSelectedId(s.id)}
        onDragEnd={(e) =>
          updateShape(s.id, { x: snap(e.target.x()), y: snap(e.target.y()) })
        }
        onTransformEnd={(e) => {
          const node = e.target as Konva.Image;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          updateShape(s.id, {
            x: snap(node.x()),
            y: snap(node.y()),
            rotation: node.rotation(),
            width: Math.max(10, s.width * scaleX),
            height: Math.max(10, s.height * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        />
      )}
    </>
  );
};


  const ShapeNode: React.FC<{ s: Shape }> = ({ s }) => {
    const isSelected = selectedId === s.id
    if (s.hidden) return null

    if (s.kind === 'rect') {
      return (
        <>
          <Rect
            id={s.id}
            x={s.x}
            y={s.y}
            width={s.width}
            height={s.height}
            cornerRadius={s.cornerRadius ?? 0}
            fill={s.fill}
            stroke={s.stroke}
            strokeWidth={s.strokeWidth}
            rotation={s.rotation}
            draggable={!isPanMode && !s.locked}
            listening={!s.locked}
            onClick={() => setSelectedId(s.id)}
            onTap={() => setSelectedId(s.id)}
            onDragEnd={(e) => updateShape(s.id, { x: snap(e.target.x()), y: snap(e.target.y()) })}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Rect
              const scaleX = node.scaleX(); const scaleY = node.scaleY(); node.scaleX(1); node.scaleY(1)
              const next = { x: snap(node.x()), y: snap(node.y()), rotation: node.rotation(), width: Math.max(10, s.width * scaleX), height: Math.max(10, s.height * scaleY) }
              updateShape(s.id, next)
            }}
          />
          {isSelected && <Transformer ref={trRef} rotateEnabled={true} enabledAnchors={[ 'top-left','top-right','bottom-left','bottom-right' ]} />}
        </>
      )
    }

    if (s.kind === 'circle') {
      return (
        <>
          <Circle
            id={s.id}
            x={s.x}
            y={s.y}
            radius={s.radius}
            fill={s.fill}
            stroke={s.stroke}
            strokeWidth={s.strokeWidth}
            rotation={s.rotation}
            draggable={!isPanMode && !s.locked}
            listening={!s.locked}
            onClick={() => setSelectedId(s.id)}
            onTap={() => setSelectedId(s.id)}
            onDragEnd={(e) => updateShape(s.id, { x: snap(e.target.x()), y: snap(e.target.y()) })}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Circle
              const scaleX = node.scaleX(); node.scaleX(1); node.scaleY(1)
              const nextRadius = Math.max(5, s.radius * scaleX)
              updateShape(s.id, { x: snap(node.x()), y: snap(node.y()), rotation: node.rotation(), radius: nextRadius })
            }}
          />
          {isSelected && <Transformer ref={trRef} rotateEnabled={true} enabledAnchors={[ 'top-left','top-right','bottom-left','bottom-right' ]} />}
        </>
      )
    }

    if (s.kind === 'text') {
      return (
        <>
          <KonvaText
            id={s.id}
            x={s.x}
            y={s.y}
            text={s.text}
            fontSize={s.fontSize}
            fill={s.fill}
            width={s.width ?? undefined}
            draggable={!isPanMode && !s.locked}
            listening={!s.locked}
            onDblClick={() => { const next = prompt('Edit text', s.text); if (next != null) updateShape(s.id, { text: next }) }}
            onDblTap={() => { const next = prompt('Edit text', s.text); if (next != null) updateShape(s.id, { text: next }) }}
            onClick={() => setSelectedId(s.id)}
            onTap={() => setSelectedId(s.id)}
            onDragEnd={(e) => updateShape(s.id, { x: snap(e.target.x()), y: snap(e.target.y()) })}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Text
              const scaleX = node.scaleX(); node.scaleX(1); node.scaleY(1)
              updateShape(s.id, { x: snap(node.x()), y: snap(node.y()), rotation: node.rotation(), width: Math.max(50, (s.width ?? 300) * scaleX) })
            }}
          />
          {isSelected && <Transformer ref={trRef} rotateEnabled={true} enabledAnchors={[ 'middle-left','middle-right' ]} />}
        </>
      )
    }

    // image 
    return (
    <ImageNode
        s={s} 
        isPanMode={isPanMode}
        isSelected={isSelected}
        trRef={trRef}
        snap={snap}
        setSelectedId={setSelectedId}
        updateShape={updateShape}
    />
    );
  }

  // ---------- Render ----------
  return (
    <div className="h-screen w-full flex flex-col bg-gray-50">
      <Toolbar />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_320px]">
        {/* Canvas container */}
        <div ref={container.ref} className="relative overflow-hidden">
          {/* Gray pattern backdrop */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.08)_1px,transparent_0)] [background-size:12px_12px]" />

          <Stage
            ref={stageRef}
            width={container.size.width}
            height={container.size.height}
            onMouseDown={onStageMouseDown}
            onMouseUp={onStageMouseUp}
            onTouchStart={(e) => {
              onStageMouseDown(e as KonvaEventObject<TouchEvent>)
              const t = e.evt as TouchEvent
              if (t.touches.length === 1) {
                const touch = t.touches[0]
                lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
              }
            }}
            onTouchEnd={() => { lastTouchRef.current = null; onStageMouseUp() }}
            onWheel={onWheel}
            onMouseMove={onStageDragMove}
            onTouchMove={(e) => {
              if (!isPanMode) return
              const t = e.evt as TouchEvent
              if (t.touches.length === 1) {
                const touch = t.touches[0]
                const last = lastTouchRef.current
                if (last) {
                  setOffset((p) => ({ x: p.x + 0.6 * (touch.clientX - last.x), y: p.y + 0.6 * (touch.clientY - last.y) }))
                }
                lastTouchRef.current = { x: touch.clientX, y: touch.clientY }
              }
            }}
          >
            <Layer x={offset.x} y={offset.y} scaleX={scale} scaleY={scale} onClick={deselect} onTap={deselect}>
              <SlideBackground />
              <GridLayer />
              {shapes.map((s) => (
                <ShapeNode key={s.id} s={s} />
              ))}
            </Layer>
          </Stage>
        </div>

        {/* Inspector */}
        <aside className={`border-l bg-white/90 backdrop-blur p-3 ${showInspector ? 'block' : 'hidden md:block'}`}>
          <div className="font-medium text-sm mb-2">Inspector</div>
          <SelectedInspector />

          <div className="mt-6">
            <div className="font-medium text-sm mb-2">Layers</div>
            <ol className="space-y-1 max-h-64 overflow-auto pr-1">
              {shapes.map((s) => (
                <li key={s.id} className={`flex items-center justify-between gap-2 text-sm px-2 py-1 rounded cursor-pointer ${selectedId === s.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`} onClick={() => !s.locked && setSelectedId(s.id)}>
                  <div className="truncate">{s.name ?? s.kind} <span className="text-xs text-gray-400">({s.kind})</span></div>
                  <div className="flex items-center gap-1">
                    <button className="border rounded px-1 text-xs" title="Front" onClick={(e) => { e.stopPropagation(); bringToFront(s.id) }}>⤴</button>
                    <button className="border rounded px-1 text-xs" title="Back" onClick={(e) => { e.stopPropagation(); sendToBack(s.id) }}>⤵</button>
                    <button className="border rounded px-1 text-xs" title="Up" onClick={(e) => { e.stopPropagation(); bringForward(s.id) }}>↑</button>
                    <button className="border rounded px-1 text-xs" title="Down" onClick={(e) => { e.stopPropagation(); sendBackward(s.id) }}>↓</button>
                    <button className={`border rounded px-1 text-xs ${s.locked ? 'bg-gray-900 text-white' : ''}`} title="Lock" onClick={(e) => { e.stopPropagation(); updateShape(s.id, { locked: !s.locked }) }}>🔒</button>
                    <button className={`border rounded px-1 text-xs ${s.hidden ? 'bg-gray-900 text-white' : ''}`} title="Hide" onClick={(e) => { e.stopPropagation(); updateShape(s.id, { hidden: !s.hidden }) }}>{s.hidden ? '🙈' : '👁'}</button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <div className="p-2 text-center text-xs text-gray-500 border-t bg-white/80">Single‑Slide Editor · Next.js + TS + react‑konva</div>
    </div>
  )
}
