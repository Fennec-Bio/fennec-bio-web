'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import * as d3 from 'd3'
import { usePlateExperiment } from '@/hooks/usePlateExperiment'
import type { Plate, Well } from '@/hooks/usePlateExperiment'
import { useDataCategories } from '@/hooks/useDataCategories'
import { tCritical95 } from '@/lib/stats'
import {
  conditionKey,
  groupedWellLabel,
} from '@/components/Plate/plateReplicateGrouping'

type BarSegment = { measurementId: number; mean: number; ci: number; n: number }
type Bar = { key: string; label: string; segments: BarSegment[]; vars: Record<string, string> }

const CHART_PALETTE = ['#eb5234', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']
const SHADE_PALETTE = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#e0e7ff', '#fee2e2', '#f3e8ff', '#cffafe']

function wellVars(well: Well): Record<string, string> {
  const out: Record<string, string> = {}
  well.variables.forEach(v => { out[v.name.toLowerCase()] = v.value })
  return out
}

export function buildBars(
  plate: Plate,
  measurementIds: number[],
  groupReplicates: boolean,
): Bar[] {
  if (measurementIds.length === 0) return []

  if (!groupReplicates) {
    return plate.wells.map(w => ({
      key: `${w.row}${w.column}`,
      label: `${w.row}${w.column}`,
      segments: measurementIds.map(mid => {
        const dp = w.data_points.find(d => d.data_category === mid)
        return { measurementId: mid, mean: dp?.value ?? 0, ci: 0, n: dp ? 1 : 0 }
      }),
      vars: wellVars(w),
    }))
  }

  const groups = new Map<string, Well[]>()
  plate.wells.forEach(w => {
    const k = conditionKey(w) || `${w.row}${w.column}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(w)
  })

  const baseLabels = new Map<string, string>()
  groups.forEach((wells, k) => {
    baseLabels.set(k, groupedWellLabel(wells[0]))
  })

  const labelCounts = new Map<string, number>()
  const finalLabels = new Map<string, string>()
  baseLabels.forEach((label, k) => {
    const seen = labelCounts.get(label) ?? 0
    labelCounts.set(label, seen + 1)
    finalLabels.set(k, seen === 0 ? label : `${label} (${seen + 1})`)
  })

  return Array.from(groups.entries()).map(([k, wells]) => {
    const segments: BarSegment[] = measurementIds.map(mid => {
      const values = wells
        .map(w => w.data_points.find(d => d.data_category === mid)?.value)
        .filter((v): v is number => typeof v === 'number')
      const n = values.length
      if (n === 0) return { measurementId: mid, mean: 0, ci: 0, n: 0 }
      const mean = d3.mean(values) ?? 0
      if (n < 2) return { measurementId: mid, mean, ci: 0, n }
      const sd = d3.deviation(values) ?? 0
      const ci = tCritical95(n - 1) * sd / Math.sqrt(n)
      return { measurementId: mid, mean, ci, n }
    })
    return { key: k, label: finalLabels.get(k) ?? k, segments, vars: wellVars(wells[0]) }
  })
}

interface ResultsProps {
  plateExperimentId: string | null
}

export function Results({ plateExperimentId }: ResultsProps) {
  const { data, loading, error } = usePlateExperiment(plateExperimentId ?? '')
  const { categories } = useDataCategories(data?.project ?? null)

  const [plateIndex, setPlateIndex] = useState(0)

  const activePlate = useMemo<Plate | null>(() => {
    if (!data || data.plates.length === 0) return null
    return data.plates[Math.min(plateIndex, data.plates.length - 1)]
  }, [data, plateIndex])

  const measurementCategories = useMemo(() => {
    const nonProcess = categories.filter(c => c.category !== 'process_data')
    if (!activePlate) return nonProcess
    const present = new Set<number>()
    activePlate.wells.forEach(w => w.data_points.forEach(d => present.add(d.data_category)))
    return nonProcess.filter(c => present.has(c.id))
  }, [categories, activePlate])

  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<number[]>([])
  const [groupReplicates, setGroupReplicates] = useState(true)
  const [measurementsOpen, setMeasurementsOpen] = useState(false)
  const measurementsRef = useRef<HTMLDivElement | null>(null)
  const [shadeBy, setShadeBy] = useState<string | null>(null)
  const [groupByVars, setGroupByVars] = useState<string[]>([])
  const [groupByOpen, setGroupByOpen] = useState(false)
  const groupByRef = useRef<HTMLDivElement | null>(null)

  const variableNames = useMemo<string[]>(() => {
    if (!activePlate) return []
    const names = new Set<string>()
    activePlate.wells.forEach(w => w.variables.forEach(v => names.add(v.name)))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [activePlate])

  useEffect(() => {
    if (shadeBy && !variableNames.some(n => n.toLowerCase() === shadeBy.toLowerCase())) {
      setShadeBy(null)
    }
  }, [variableNames, shadeBy])

  useEffect(() => {
    setGroupByVars(prev => prev.filter(n => variableNames.some(v => v.toLowerCase() === n.toLowerCase())))
  }, [variableNames])

  useEffect(() => {
    if (!groupByOpen) return
    const handler = (e: MouseEvent) => {
      if (groupByRef.current && !groupByRef.current.contains(e.target as Node)) {
        setGroupByOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [groupByOpen])

  useEffect(() => {
    if (!measurementsOpen) return
    const handler = (e: MouseEvent) => {
      if (measurementsRef.current && !measurementsRef.current.contains(e.target as Node)) {
        setMeasurementsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [measurementsOpen])

  useEffect(() => {
    setPlateIndex(0)
  }, [plateExperimentId])

  useEffect(() => {
    if (measurementCategories.length === 0) {
      setSelectedMeasurementIds([])
      return
    }
    setSelectedMeasurementIds(prev => {
      const stillValid = prev.filter(id => measurementCategories.some(c => c.id === id))
      if (stillValid.length > 0) return stillValid
      return measurementCategories.map(c => c.id)
    })
  }, [measurementCategories])

  const svgRefTop = useRef<SVGSVGElement | null>(null)
  const svgRefBottom = useRef<SVGSVGElement | null>(null)

  const bars = useMemo(() => {
    if (!activePlate) return []
    const built = buildBars(activePlate, selectedMeasurementIds, groupReplicates)
    if (groupByVars.length === 0) return built
    const keys = groupByVars.map(n => n.toLowerCase())
    const sortValue = (b: Bar, k: string) => b.vars[k] ?? ''
    return [...built].sort((a, b) => {
      for (const k of keys) {
        const av = sortValue(a, k)
        const bv = sortValue(b, k)
        if (av !== bv) {
          const an = parseFloat(av)
          const bn = parseFloat(bv)
          if (!isNaN(an) && !isNaN(bn)) return an - bn
          return av.localeCompare(bv)
        }
      }
      return 0
    })
  }, [activePlate, selectedMeasurementIds, groupReplicates, groupByVars])

  const splitBars = useMemo<[Bar[], Bar[] | null]>(() => {
    if (bars.length <= 48) return [bars, null]
    const half = Math.ceil(bars.length / 2)
    return [bars.slice(0, half), bars.slice(half)]
  }, [bars])

  const sharedYMax = useMemo(() => {
    if (bars.length === 0) return 1
    const stackTotals = bars.map(b => b.segments.reduce((s, seg) => s + seg.mean, 0))
    const maxCi = d3.max(bars, b =>
      d3.max(b.segments.map((seg, i) =>
        b.segments.slice(0, i + 1).reduce((s, x) => s + x.mean, 0) + seg.ci,
      )) ?? 0,
    ) ?? 0
    return Math.max(d3.max(stackTotals) ?? 0, maxCi) || 1
  }, [bars])

  const measurementColor = (mid: number, total: number): string => {
    if (total === 1) return '#eb5234'
    const pos = selectedMeasurementIds.indexOf(mid)
    return CHART_PALETTE[(pos % CHART_PALETTE.length + CHART_PALETTE.length) % CHART_PALETTE.length]
  }

  const shadeMap = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>()
    if (!shadeBy) return m
    const key = shadeBy.toLowerCase()
    const seen: string[] = []
    bars.forEach(b => {
      const v = b.vars[key]
      if (v !== undefined && !seen.includes(v)) seen.push(v)
    })
    seen.forEach((v, i) => m.set(v, SHADE_PALETTE[i % SHADE_PALETTE.length]))
    return m
  }, [shadeBy, bars])

  useEffect(() => {
    const renderChart = (svgEl: SVGSVGElement | null, barsSubset: Bar[], showEmptyMessage: boolean) => {
      if (!svgEl) return
      const svg = d3.select(svgEl)
      svg.selectAll('*').remove()

      const margin = { top: 16, right: 16, bottom: 70, left: 48 }
      const width = 720 - margin.left - margin.right
      const height = 320 - margin.top - margin.bottom

      svg
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

      if (showEmptyMessage && selectedMeasurementIds.length === 0) {
        g.append('text').attr('x', width / 2).attr('y', height / 2)
          .attr('text-anchor', 'middle').attr('fill', '#6b7280')
          .text('Select at least one measurement.')
        return
      }
      if (showEmptyMessage && barsSubset.length === 0) {
        g.append('text').attr('x', width / 2).attr('y', height / 2)
          .attr('text-anchor', 'middle').attr('fill', '#6b7280')
          .text('No data for this measurement on this plate.')
        return
      }
      if (barsSubset.length === 0) return

      const x = d3.scaleBand<string>()
        .domain(barsSubset.map(b => b.key))
        .range([0, width])
        .padding(0.2)

      const y = d3.scaleLinear().domain([0, sharedYMax * 1.1]).range([height, 0])

      if (shadeBy) {
        const step = x.step()
        const shadeKey = shadeBy.toLowerCase()
        barsSubset.forEach(bar => {
          const v = bar.vars[shadeKey]
          const color = v !== undefined ? shadeMap.get(v) : undefined
          if (!color) return
          const xPos = x(bar.key) ?? 0
          g.append('rect')
            .attr('x', xPos - (step - x.bandwidth()) / 2)
            .attr('y', 0)
            .attr('width', step)
            .attr('height', height)
            .attr('fill', color)
        })
      }

      g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'rotate(-40)')
        .style('text-anchor', 'end')

      g.selectAll<SVGTextElement, string>('.tick text').each(function (d) {
        const bar = barsSubset.find(b => b.key === d)
        if (bar) d3.select(this).text(bar.label)
      })

      g.append('g').call(d3.axisLeft(y))

      const total = selectedMeasurementIds.length

      barsSubset.forEach(bar => {
        let cum = 0
        bar.segments.forEach(seg => {
          const segTop = cum + seg.mean
          const xPos = x(bar.key) ?? 0
          const w = x.bandwidth()
          g.append('rect')
            .attr('x', xPos)
            .attr('y', y(segTop))
            .attr('width', w)
            .attr('height', y(cum) - y(segTop))
            .attr('fill', measurementColor(seg.measurementId, total))
            .append('title')
            .text(() => {
              const cat = measurementCategories.find(c => c.id === seg.measurementId)
              const unit = cat?.unit ? ` ${cat.unit}` : ''
              const ciStr = seg.n >= 2 ? ` ± ${seg.ci.toFixed(2)}${unit} (n=${seg.n}, 95% CI)` : ` (n=${seg.n})`
              return `${bar.label} · ${cat?.name ?? ''}: ${seg.mean.toFixed(2)}${unit}${ciStr}`
            })

          if (seg.n >= 2 && seg.ci > 0) {
            const cx = xPos + w / 2
            g.append('line')
              .attr('x1', cx).attr('x2', cx)
              .attr('y1', y(segTop - seg.ci)).attr('y2', y(segTop + seg.ci))
              .attr('stroke', '#111827').attr('stroke-width', 1)
            g.append('line')
              .attr('x1', cx - 4).attr('x2', cx + 4)
              .attr('y1', y(segTop + seg.ci)).attr('y2', y(segTop + seg.ci))
              .attr('stroke', '#111827').attr('stroke-width', 1)
            g.append('line')
              .attr('x1', cx - 4).attr('x2', cx + 4)
              .attr('y1', y(segTop - seg.ci)).attr('y2', y(segTop - seg.ci))
              .attr('stroke', '#111827').attr('stroke-width', 1)
          }
          cum = segTop
        })
      })
    }

    const [topBars, bottomBars] = splitBars
    renderChart(svgRefTop.current, topBars, true)
    if (bottomBars) renderChart(svgRefBottom.current, bottomBars, false)
    else if (svgRefBottom.current) d3.select(svgRefBottom.current).selectAll('*').remove()
    // measurementColor and measurementCategories are stable enough for this read; splitBars/sharedYMax drive rerenders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitBars, sharedYMax, selectedMeasurementIds, measurementCategories, shadeBy, shadeMap])

  if (plateExperimentId === null) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-gray-500">
        Select a plate experiment from the sidebar to see results.
      </div>
    )
  }
  if (loading) {
    return <div className="bg-white rounded-lg shadow p-6 text-gray-500">Loading plate data…</div>
  }
  if (error) {
    return <div className="bg-white rounded-lg shadow p-6 text-red-600">{error}</div>
  }
  if (!data) return null
  if (data.plates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-gray-500">
        This experiment has no plates yet.
      </div>
    )
  }

  const plate = activePlate!

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="text-sm text-gray-500">
        {data.title} · {plate.label} ({plate.format}-well)
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {data.plates.length > 1 && (
          <select
            className="h-9 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
            value={plateIndex}
            onChange={e => setPlateIndex(Number(e.target.value))}
            aria-label="Plate"
          >
            {data.plates.map((p, i) => (
              <option key={p.id} value={i}>{p.label}</option>
            ))}
          </select>
        )}
        <div className="relative" ref={measurementsRef}>
          <button
            type="button"
            onClick={() => setMeasurementsOpen(o => !o)}
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all flex items-center gap-1"
          >
            Measurements ({selectedMeasurementIds.length})
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {measurementsOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] min-w-[220px] max-h-72 overflow-y-auto">
              {measurementCategories.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500">No measurements available</div>
              ) : (
                measurementCategories.map(c => {
                  const checked = selectedMeasurementIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedMeasurementIds(prev =>
                            checked ? prev.filter(id => id !== c.id) : [...prev, c.id],
                          )
                        }}
                      />
                      <span>{c.name} ({c.unit || '—'})</span>
                    </label>
                  )
                })
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className={
            groupReplicates
              ? 'px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium'
              : 'px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50'
          }
          onClick={() => setGroupReplicates(v => !v)}
        >
          {groupReplicates ? 'Grouping replicates' : 'Individual wells'}
        </button>
        {variableNames.length > 0 && (
          <div className="relative" ref={groupByRef}>
            <button
              type="button"
              onClick={() => setGroupByOpen(o => !o)}
              className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all flex items-center gap-1"
            >
              Group by ({groupByVars.length})
              <ChevronDown className="h-3 w-3 text-gray-500" />
            </button>
            {groupByOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] min-w-[200px] max-h-72 overflow-y-auto">
                {variableNames.map(n => {
                  const checked = groupByVars.some(g => g.toLowerCase() === n.toLowerCase())
                  return (
                    <label
                      key={n}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setGroupByVars(prev =>
                            checked
                              ? prev.filter(g => g.toLowerCase() !== n.toLowerCase())
                              : [...prev, n],
                          )
                        }}
                      />
                      <span>{n}</span>
                    </label>
                  )
                })}
                {groupByVars.length > 0 && (
                  <button
                    type="button"
                    className="w-full px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 border-t border-gray-100 text-left"
                    onClick={() => setGroupByVars([])}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {variableNames.length > 0 && (
          <select
            className="h-9 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
            value={shadeBy ?? ''}
            onChange={e => setShadeBy(e.target.value || null)}
            aria-label="Shade by variable"
          >
            <option value="">Shade by…</option>
            {variableNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
      </div>
      <svg ref={svgRefTop} className="w-full" />
      {splitBars[1] && <svg ref={svgRefBottom} className="w-full" />}
      {shadeBy && shadeMap.size > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-700">
          <span className="text-gray-500">{shadeBy}:</span>
          {Array.from(shadeMap.entries()).map(([value, color]) => (
            <span key={value} className="inline-flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-gray-300"
                style={{ background: color }}
              />
              {value}
            </span>
          ))}
        </div>
      )}
      {selectedMeasurementIds.length >= 2 && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-700">
          {selectedMeasurementIds.map(mid => {
            const c = measurementCategories.find(c => c.id === mid)
            if (!c) return null
            return (
              <span key={mid} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: measurementColor(mid, selectedMeasurementIds.length) }}
                />
                {c.name}
              </span>
            )
          })}
        </div>
      )}
      {(() => {
        const selected = measurementCategories.filter(c => selectedMeasurementIds.includes(c.id))
        const units = new Set(selected.map(c => c.unit || ''))
        if (selected.length === 0) return null
        return (
          <div className="text-xs text-gray-500">
            Y-axis: {units.size === 1 ? (selected[0].unit || '—') : 'Mixed units'}
          </div>
        )
      })()}
    </div>
  )
}
