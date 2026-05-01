'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchResponseSurface } from '@/lib/analysis/api'
import type {
  CohortPayload,
  OutcomeMetric,
  ResponseSurfaceResult,
  ResponseSurfaceResult3D,
} from '@/lib/analysis/types'

const GRID = 50

// Evaluate the 3-variable quadratic on a 50×50 grid at a fixed z slice.
function evalSliceGrid(
  beta: number[],
  xRange: [number, number],
  yRange: [number, number],
  zSlice: number,
): { xGrid: number[]; yGrid: number[]; zGrid: number[][] } {
  const [b0, b1, b2, b3, b11, b22, b33, b12, b13, b23] = beta
  const xMin = xRange[0], xMax = xRange[1]
  const yMin = yRange[0], yMax = yRange[1]
  const xStep = (xMax - xMin) / (GRID - 1)
  const yStep = (yMax - yMin) / (GRID - 1)
  const xGrid: number[] = []
  const yGrid: number[] = []
  for (let i = 0; i < GRID; i++) {
    xGrid.push(xMin + i * xStep)
    yGrid.push(yMin + i * yStep)
  }
  const zSliceTerms = b0 + b3 * zSlice + b33 * zSlice * zSlice
  const zGrid: number[][] = []
  for (let yi = 0; yi < GRID; yi++) {
    const row: number[] = []
    const yv = yGrid[yi]
    for (let xi = 0; xi < GRID; xi++) {
      const xv = xGrid[xi]
      row.push(
        zSliceTerms
        + b1 * xv + b2 * yv
        + b11 * xv * xv + b22 * yv * yv
        + b12 * xv * yv + b13 * xv * zSlice + b23 * yv * zSlice,
      )
    }
    zGrid.push(row)
  }
  return { xGrid, yGrid, zGrid }
}

export function ResponseSurface({ payload, ids, outcome, product }: {
  payload: CohortPayload
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
}) {
  const { getToken } = useAuth()

  const numericVars = useMemo(() => {
    const s = new Set<string>()
    for (const e of payload.experiments) {
      for (const v of e.variables) {
        if (!Number.isNaN(parseFloat(v.value))) s.add(v.name)
      }
    }
    return [...s].sort()
  }, [payload])

  const [varX, setVarX] = useState<string>(() => numericVars[0] ?? '')
  const [varY, setVarY] = useState<string>(() => numericVars[1] ?? '')
  const [varZ, setVarZ] = useState<string>('')   // empty = 2D mode
  const [data, setData] = useState<ResponseSurfaceResult | null>(null)
  const [zSlice, setZSlice] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<SVGSVGElement | null>(null)
  const idsKey = ids.join(',')

  useEffect(() => {
    if (!varX || !varY || varX === varY) return
    if (varZ && (varZ === varX || varZ === varY)) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const token = await getToken()
        const r = await fetchResponseSurface(token, {
          experiment_ids: ids, outcome, product,
          var_x: varX, var_y: varY, var_z: varZ || null,
        })
        if (!cancelled) {
          setData(r)
          if (r.mode === '3d') {
            // Default the slider to the median of the cohort's z values.
            const zs = r.observed_points.map(p => p.z).sort((a, b) => a - b)
            const median = zs.length ? zs[Math.floor(zs.length / 2)] : (r.z_range[0] + r.z_range[1]) / 2
            setZSlice(median)
          } else {
            setZSlice(null)
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, outcome, product, varX, varY, varZ, getToken])

  // Compute the active grid: precomputed z_grid in 2D mode, locally evaluated in 3D mode.
  const activeGrid = useMemo(() => {
    if (!data) return null
    if (data.mode === '2d') {
      return {
        xGrid: data.x_grid, yGrid: data.y_grid, zGrid: data.z_grid,
        xRange: data.x_range, yRange: data.y_range,
      }
    }
    if (zSlice === null) return null
    const slice = evalSliceGrid(data.beta, data.x_range, data.y_range, zSlice)
    return {
      xGrid: slice.xGrid, yGrid: slice.yGrid, zGrid: slice.zGrid,
      xRange: data.x_range, yRange: data.y_range,
    }
  }, [data, zSlice])

  useEffect(() => {
    if (!ref.current || !data || !activeGrid) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth, H = 480
    const m = { top: 20, right: 30, bottom: 40, left: 50 }
    const iw = W - m.left - m.right, ih = H - m.top - m.bottom
    svg.attr('viewBox', `0 0 ${W} ${H}`)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const x = d3.scaleLinear().domain(activeGrid.xRange).range([0, iw])
    const y = d3.scaleLinear().domain(activeGrid.yRange).range([ih, 0])
    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y).ticks(6))

    const flat = activeGrid.zGrid.flat()
    const contours = d3.contours()
      .size([activeGrid.xGrid.length, activeGrid.yGrid.length])
      .thresholds(15)(flat)

    const zMin = d3.min(flat) ?? 0
    const zMax = d3.max(flat) ?? 1
    const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([zMin, zMax])

    g.append('g').selectAll('path').data(contours).enter().append('path')
      .attr('d', d3.geoPath(d3.geoIdentity().scale(1)))
      .attr('transform', `scale(${iw / (activeGrid.xGrid.length - 1)},${-ih / (activeGrid.yGrid.length - 1)}) translate(0, ${-(activeGrid.yGrid.length - 1)})`)
      .attr('fill', d => colorScale(d.value) as string)
      .attr('opacity', 0.8)
      .attr('stroke', '#ffffff').attr('stroke-width', 0.3)

    // Observed points: in 3D, fade dots whose z is far from the active slice.
    if (data.mode === '2d') {
      g.selectAll('circle.obs').data(data.observed_points).enter().append('circle')
        .attr('class', 'obs')
        .attr('cx', d => x(d.x)).attr('cy', d => y(d.y))
        .attr('r', 4).attr('fill', '#eb5234').attr('stroke', '#fff').attr('stroke-width', 1)
    } else if (zSlice !== null) {
      const span = data.z_range[1] - data.z_range[0]
      const tol = span * 0.1 || 1
      g.selectAll('circle.obs').data(data.observed_points).enter().append('circle')
        .attr('class', 'obs')
        .attr('cx', d => x(d.x)).attr('cy', d => y(d.y))
        .attr('r', 4)
        .attr('fill', '#eb5234')
        .attr('opacity', d => {
          const dist = Math.abs(d.z - zSlice) / tol
          return dist <= 1 ? 1 : Math.max(0.15, 1 - (dist - 1) * 0.4)
        })
        .attr('stroke', '#fff').attr('stroke-width', 1)
    }

    if (data.optimum) {
      g.append('circle')
        .attr('cx', x(data.optimum.x)).attr('cy', y(data.optimum.y))
        .attr('r', 8).attr('fill', 'none').attr('stroke', '#000').attr('stroke-width', 2)
      const opt = data.optimum
      const optLabel = data.mode === '3d'
        ? `optimum (${opt.x.toFixed(2)}, ${opt.y.toFixed(2)}, ${(opt as ResponseSurfaceResult3D['optimum'] & object).z.toFixed(2)}) → ${opt.predicted_outcome.toFixed(2)}`
        : `optimum (${opt.x.toFixed(2)}, ${opt.y.toFixed(2)}) → ${opt.predicted_outcome.toFixed(2)}`
      g.append('text')
        .attr('x', x(data.optimum.x) + 12).attr('y', y(data.optimum.y) + 4)
        .attr('fill', '#000').attr('font-size', 11)
        .text(optLabel)
    }
  }, [data, activeGrid, zSlice])

  if (numericVars.length < 2) {
    return <div className="text-sm text-gray-500">Need at least 2 numeric variables in the cohort.</div>
  }
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
        <span className="text-gray-500">X:</span>
        <select value={varX} onChange={e => setVarX(e.target.value)}
          className="h-8 px-2 border border-gray-200 rounded-md">
          {numericVars.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="text-gray-500">Y:</span>
        <select value={varY} onChange={e => setVarY(e.target.value)}
          className="h-8 px-2 border border-gray-200 rounded-md">
          {numericVars.filter(v => v !== varX).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="text-gray-500">Z:</span>
        <select value={varZ} onChange={e => setVarZ(e.target.value)}
          className="h-8 px-2 border border-gray-200 rounded-md">
          <option value="">(none — 2D)</option>
          {numericVars.filter(v => v !== varX && v !== varY).map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        {data && (
          <span className="ml-auto text-gray-500">
            R² = {data.r_squared.toFixed(3)}
            {data.mode === '3d' && zSlice !== null
              ? `   ·   ${varZ} = ${zSlice.toFixed(2)}`
              : ''}
          </span>
        )}
      </div>

      {data && data.mode === '3d' && zSlice !== null && (
        <div className="mb-3 flex items-center gap-3 text-xs text-gray-600">
          <span className="w-24 shrink-0">{varZ} slice</span>
          <span className="tabular-nums w-12 text-right">{data.z_range[0].toFixed(1)}</span>
          <input
            type="range"
            min={data.z_range[0]}
            max={data.z_range[1]}
            step={(data.z_range[1] - data.z_range[0]) / 100 || 0.01}
            value={zSlice}
            onChange={e => setZSlice(parseFloat(e.target.value))}
            className="flex-1 accent-[#eb5234]"
          />
          <span className="tabular-nums w-12">{data.z_range[1].toFixed(1)}</span>
          <span className="tabular-nums w-16 font-medium text-gray-900">{zSlice.toFixed(2)}</span>
        </div>
      )}

      {loading && <div className="text-sm text-gray-500">Fitting surface…</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">{error}</div>}
      <svg ref={ref} className="w-full" style={{ height: 480 }} />
    </div>
  )
}
