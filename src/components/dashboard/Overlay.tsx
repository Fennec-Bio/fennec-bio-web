'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import * as d3 from 'd3'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

interface Product {
  id: number
  name: string
  unit: string
  timepoint: string
  value: number
}

interface ProcessData {
  id: number
  name: string
  unit: string
  time: string
  value: number
  type?: string
}

interface Variable {
  id: number
  name: string
  value: string
}

interface Event {
  id: number
  name: string
  timepoint: string
  value: number
}

interface Anomaly {
  id: number
  name: string
  timepoint: string
  description?: string
}

interface ExperimentDetail {
  experiment: Experiment
  products: Product[]
  secondary_products: Product[]
  process_data: ProcessData[]
  variables: Variable[]
  events: Event[]
  anomalies: Anomaly[]
  unique_names?: {
    products?: string[]
    secondary_products?: string[]
    process_data?: string[]
  }
}

interface DataPoint {
  time: number
  timepoint: string
  value: number
  name: string
  unit: string
  type: string
  experimentPrefix: string
}

interface OverlayProps {
  experiments: Experiment[]
}

const EXP_COLORS = [
  d3.schemeCategory10,
  ['#e377c2', '#7f7f7f', '#bcbd22', '#17becf', '#9467bd', '#8c564b', '#d62728', '#2ca02c', '#ff7f0e', '#1f77b4'],
  ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3', '#1b9e77', '#d95f02'],
]

const EVENT_COLORS = ['#3b82f6', '#9333ea', '#059669']
const ANOMALY_COLORS = ['#ef4444', '#f97316', '#eab308']
const CHECKBOX_COLORS = ['text-blue-600', 'text-purple-600', 'text-emerald-600']

function parseTimepoint(tp: string): number {
  const match = tp.match(/(\d+(?:\.\d+)?)\s*(hr|hours?|h|min|minutes?|m|days?|d)/i)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2].toLowerCase()
    if (unit.includes('min') || unit === 'm') return num / 60
    if (unit.includes('day') || unit === 'd') return num * 24
    return num
  }
  const num = parseFloat(tp)
  return isNaN(num) ? 0 : num
}

function decimateData<T>(data: T[], maxPoints = 1000): T[] {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  const result: T[] = [data[0]]
  for (let i = step; i < data.length - step; i += step) result.push(data[i])
  if (result[result.length - 1] !== data[data.length - 1]) result.push(data[data.length - 1])
  return result
}

type DropdownKey = 'exp1' | 'exp2' | 'exp3' | 'met1' | 'met2' | 'met3' | 'graphType'
const CLOSED_DROPDOWNS: Record<DropdownKey, boolean> = {
  exp1: false, exp2: false, exp3: false, met1: false, met2: false, met3: false, graphType: false,
}

export function Overlay({ experiments }: OverlayProps) {
  const { getToken } = useAuth()

  const [exps, setExps] = useState<(Experiment | null)[]>([null, null, null])
  const [datas, setDatas] = useState<(ExperimentDetail | null)[]>([null, null, null])
  const [loadings, setLoadings] = useState([false, false, false])
  const [metabolites, setMetabolites] = useState<Record<string, boolean>[]>([{}, {}, {}])
  const [showVariables, setShowVariables] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [graphType, setGraphType] = useState<'line' | 'bar'>('line')
  const [dropdowns, setDropdowns] = useState<Record<DropdownKey, boolean>>({ ...CLOSED_DROPDOWNS })

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const setExp = (idx: number, exp: Experiment) => setExps(prev => { const n = [...prev]; n[idx] = exp; return n })
  const setData = (idx: number, data: ExperimentDetail | null) => setDatas(prev => { const n = [...prev]; n[idx] = data; return n })
  const setLoading = (idx: number, val: boolean) => setLoadings(prev => { const n = [...prev]; n[idx] = val; return n })
  const setMet = (idx: number, fn: (prev: Record<string, boolean>) => Record<string, boolean>) =>
    setMetabolites(prev => { const n = [...prev]; n[idx] = fn(prev[idx]); return n })

  const toggleDropdown = (key: DropdownKey) => {
    setDropdowns(prev => {
      const next = { ...CLOSED_DROPDOWNS }
      next[key] = !prev[key]
      return next
    })
  }
  const closeDropdowns = () => setDropdowns({ ...CLOSED_DROPDOWNS })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.overlay-dropdown')) closeDropdowns()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const getGraphDimensions = useCallback(() => {
    const w = containerRef.current?.clientWidth || 800
    const width = Math.max(w - 40, 450)
    return { width, height: Math.round(width * 0.4) }
  }, [])

  const fetchExperimentData = useCallback(async (title: string, idx: number) => {
    setLoading(idx, true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(title)}/`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error('Failed to fetch')
      setData(idx, await res.json())
    } catch (err) {
      console.error('Error fetching experiment data:', err)
    } finally {
      setLoading(idx, false)
    }
  }, [getToken])

  // Fetch data when experiments change
  useEffect(() => { if (exps[0]) fetchExperimentData(exps[0].title, 0) }, [exps[0], fetchExperimentData])
  useEffect(() => { if (exps[1]) fetchExperimentData(exps[1].title, 1) }, [exps[1], fetchExperimentData])
  useEffect(() => { if (exps[2]) fetchExperimentData(exps[2].title, 2) }, [exps[2], fetchExperimentData])

  const initMetabolites = (data: ExperimentDetail | null): Record<string, boolean> => {
    if (!data) return {}
    const defaults: Record<string, boolean> = {}
    data.unique_names?.products?.forEach(n => { defaults[n] = true })
    data.unique_names?.secondary_products?.forEach(n => { defaults[n] = false })
    data.unique_names?.process_data?.forEach(n => { defaults[n] = false })
    return defaults
  }

  useEffect(() => { setMetabolites(prev => { const n = [...prev]; n[0] = initMetabolites(datas[0]); return n }) }, [datas[0]])
  useEffect(() => { setMetabolites(prev => { const n = [...prev]; n[1] = initMetabolites(datas[1]); return n }) }, [datas[1]])
  useEffect(() => { setMetabolites(prev => { const n = [...prev]; n[2] = initMetabolites(datas[2]); return n }) }, [datas[2]])

  const processExpData = useCallback((
    data: ExperimentDetail, selected: Record<string, boolean>, prefix: string,
  ): DataPoint[] => {
    const productPoints = [
      ...data.products.map(p => ({ ...p, type: 'product' })),
      ...data.secondary_products.map(p => ({ ...p, type: 'secondary_product' })),
    ]
      .filter(p => selected[p.name])
      .map(p => ({
        time: parseTimepoint(p.timepoint), timepoint: p.timepoint,
        value: p.value, name: p.name, unit: p.unit, type: p.type, experimentPrefix: prefix,
      }))

    const processPoints = data.process_data
      .filter(p => selected[p.name])
      .map(p => ({
        time: parseFloat(p.time), timepoint: p.time,
        value: p.value, name: p.name, unit: p.unit, type: 'process_data', experimentPrefix: prefix,
      }))

    return [...productPoints, ...processPoints].sort((a, b) => a.time - b.time)
  }, [])

  const buildAllData = useCallback(() => {
    const all: DataPoint[] = []
    for (let i = 0; i < 3; i++) {
      if (datas[i]) all.push(...processExpData(datas[i]!, metabolites[i], `Exp${i + 1}`))
    }
    return all
  }, [datas, metabolites, processExpData])

  const buildColorMap = (groups: d3.InternMap<string, DataPoint[]>) => {
    const colorMap = new Map<string, string>()
    const counters = [0, 0, 0]
    groups.forEach((_, key) => {
      for (let i = 0; i < 3; i++) {
        if (key.startsWith(`Exp${i + 1}:`)) {
          colorMap.set(key, EXP_COLORS[i][counters[i]++ % EXP_COLORS[i].length])
          break
        }
      }
    })
    return colorMap
  }

  const renderLineGraph = useCallback(() => {
    if (!svgRef.current || !datas.some(d => d)) return
    d3.select(svgRef.current).selectAll('*').remove()

    const margin = { top: 30, right: 180, bottom: 50, left: 70 }
    const { width: tw, height: th } = getGraphDimensions()
    const w = tw - margin.left - margin.right
    const h = th - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr('width', tw).attr('height', th)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const allData = buildAllData()

    if (allData.length === 0) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('fill', '#666')
        .text('Select experiments and metabolites to compare')
      return
    }

    const groups = d3.group(allData, d => `${d.experimentPrefix}: ${d.name}`)
    const colorMap = buildColorMap(groups)

    const xScale = d3.scaleLinear().domain([0, d3.max(allData, d => d.time)!]).range([0, w])
    const yScale = d3.scaleLinear().domain([0, d3.max(allData, d => d.value)!]).range([h, 0])
    const line = d3.line<DataPoint>().x(d => xScale(d.time)).y(d => yScale(d.value))

    svg.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xScale).ticks(8))
    svg.append('g').call(d3.axisLeft(yScale))

    groups.forEach((points, key) => {
      const sorted = points.sort((a, b) => a.time - b.time)
      const display = decimateData(sorted, 1000)
      svg.append('path').datum(display).attr('fill', 'none')
        .attr('stroke', colorMap.get(key)!).attr('stroke-width', 2).attr('d', line)
      if (sorted.length <= 100 || sorted[0]?.type !== 'process_data') {
        svg.selectAll(null).data(display).enter().append('circle')
          .attr('cx', d => xScale(d.time)).attr('cy', d => yScale(d.value))
          .attr('r', 4).attr('fill', colorMap.get(key)!).attr('stroke', 'white').attr('stroke-width', 2)
      }
    })

    // Event & anomaly markers
    const maxTime = d3.max(allData, d => d.time)!
    const drawMarkers = (items: { timepoint: string; name: string }[], color: string, prefix: string) => {
      items.forEach(item => {
        const t = parseTimepoint(item.timepoint)
        if (t >= 0 && t <= maxTime) {
          const x = xScale(t)
          svg.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', h)
            .attr('stroke', color).attr('stroke-width', 2).attr('stroke-dasharray', '5,5').attr('opacity', 0.7)
          svg.append('text').attr('x', x).attr('y', -10).attr('text-anchor', 'middle')
            .attr('font-size', '10px').attr('font-weight', 'bold').attr('fill', color).text(`${prefix}: ${item.name}`)
        }
      })
    }
    if (showEvents) {
      for (let i = 0; i < 3; i++) {
        if (datas[i]?.events) drawMarkers(datas[i]!.events, EVENT_COLORS[i], `E${i + 1}`)
      }
    }
    if (showAnomalies) {
      for (let i = 0; i < 3; i++) {
        if (datas[i]?.anomalies) drawMarkers(datas[i]!.anomalies, ANOMALY_COLORS[i], `A${i + 1}`)
      }
    }

    // Axis labels
    svg.append('text').attr('x', w / 2).attr('y', h + 40).attr('text-anchor', 'middle').attr('font-size', '12px').text('Time (hr)')
    svg.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -50).attr('text-anchor', 'middle').attr('font-size', '12px').text('Value')

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${w + 20}, 10)`)
    Array.from(groups.keys()).forEach((key, i) => {
      const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`)
      g.append('rect').attr('width', 12).attr('height', 12).attr('fill', colorMap.get(key)!)
      g.append('text').attr('x', 16).attr('y', 9).attr('font-size', '11px').text(key)
    })
  }, [datas, metabolites, showEvents, showAnomalies, getGraphDimensions, buildAllData])

  const renderBarGraph = useCallback(() => {
    if (!svgRef.current || !datas.some(d => d)) return
    d3.select(svgRef.current).selectAll('*').remove()

    const margin = { top: 30, right: 180, bottom: 50, left: 70 }
    const { width: tw, height: th } = getGraphDimensions()
    const w = tw - margin.left - margin.right
    const h = th - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr('width', tw).attr('height', th)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const allData = buildAllData()

    if (allData.length === 0) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('fill', '#666')
        .text('Select experiments and metabolites to compare')
      return
    }

    const timepoints = [...new Set(allData.map(d => d.time))].sort((a, b) => a - b)
    const groups = d3.group(allData, d => `${d.experimentPrefix}: ${d.name}`)
    const colorMap = buildColorMap(groups)

    const xScale = d3.scaleBand().domain(timepoints.map(String)).range([0, w]).padding(0.1)
    const yScale = d3.scaleLinear().domain([0, d3.max(allData, d => d.value)!]).range([h, 0])

    const displayTicks = timepoints.length > 8
      ? timepoints.filter((_, i) => i % Math.ceil(timepoints.length / 8) === 0)
      : timepoints
    svg.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).tickValues(displayTicks.map(String)).tickFormat(d => `${d} hr`))
    svg.append('g').call(d3.axisLeft(yScale))

    const keys = Array.from(groups.keys())
    const barWidth = (xScale.bandwidth() || 0) / keys.length
    groups.forEach((pts, key) => {
      const idx = keys.indexOf(key)
      pts.forEach(d => {
        const x = xScale(String(d.time))
        if (x !== undefined) {
          svg.append('rect').attr('x', x + idx * barWidth).attr('y', yScale(d.value))
            .attr('width', barWidth - 1).attr('height', h - yScale(d.value))
            .attr('fill', colorMap.get(key)!).attr('stroke', 'white').attr('stroke-width', 0.5)
        }
      })
    })

    svg.append('text').attr('x', w / 2).attr('y', h + 40).attr('text-anchor', 'middle').attr('font-size', '12px').text('Time (hr)')
    svg.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -50).attr('text-anchor', 'middle').attr('font-size', '12px').text('Value')

    const legend = svg.append('g').attr('transform', `translate(${w + 20}, 10)`)
    keys.forEach((key, i) => {
      const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`)
      g.append('rect').attr('width', 12).attr('height', 12).attr('fill', colorMap.get(key)!)
      g.append('text').attr('x', 16).attr('y', 9).attr('font-size', '11px').text(key)
    })
  }, [datas, metabolites, getGraphDimensions, buildAllData])

  // Render on data/selection changes
  useEffect(() => {
    if (!svgRef.current) return
    graphType === 'bar' ? renderBarGraph() : renderLineGraph()
  }, [datas, metabolites, graphType, showEvents, showAnomalies, renderLineGraph, renderBarGraph])

  // Debounced resize
  useEffect(() => {
    let timeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (svgRef.current && datas.some(d => d)) {
          graphType === 'bar' ? renderBarGraph() : renderLineGraph()
        }
      }, 150)
    }
    window.addEventListener('resize', handleResize)
    return () => { clearTimeout(timeout); window.removeEventListener('resize', handleResize) }
  }, [datas, graphType, renderLineGraph, renderBarGraph])

  const isLoading = loadings.some(l => l)

  const renderMetaboliteSections = (
    data: ExperimentDetail | null,
    selected: Record<string, boolean>,
    setSelected: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
    checkboxColor: string,
  ) => {
    if (!data) return null
    const sections = [
      { label: 'Products', items: data.unique_names?.products },
      { label: 'Secondary Products', items: data.unique_names?.secondary_products },
      { label: 'Process Data', items: data.unique_names?.process_data },
    ]
    return sections.map(section =>
      section.items && section.items.length > 0 && (
        <div key={section.label} className="p-3 border-b last:border-b-0">
          <h4 className="font-medium text-gray-900 mb-2 text-sm">{section.label}</h4>
          <div className="space-y-1.5">
            {section.items.map(name => (
              <label key={name} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected[name] || false}
                  onChange={e => setSelected(prev => ({ ...prev, [name]: e.target.checked }))}
                  className={`rounded border-gray-300 ${checkboxColor} focus:ring-blue-500`}
                />
                <span className="text-sm text-gray-700">{name}</span>
              </label>
            ))}
          </div>
        </div>
      )
    )
  }

  const expConfigs = [
    { key: 'exp1' as DropdownKey, metKey: 'met1' as DropdownKey, idx: 0, label: 'Exp1' },
    { key: 'exp2' as DropdownKey, metKey: 'met2' as DropdownKey, idx: 1, label: 'Exp2' },
    { key: 'exp3' as DropdownKey, metKey: 'met3' as DropdownKey, idx: 2, label: 'Exp3' },
  ]

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Experiment selectors */}
      <div className="flex gap-3 w-full flex-wrap">
        {expConfigs.map(({ key, idx, label }) => (
          <div key={key} className="relative flex-1 min-w-[200px] overlay-dropdown">
            <button
              className="w-full h-9 px-4 py-2 rounded-md text-sm font-medium text-white shadow-xs hover:opacity-90 transition-all truncate"
              style={{ backgroundColor: '#eb5234' }}
              onClick={() => toggleDropdown(key)}
            >
              {exps[idx] ? `${label}: ${exps[idx]!.title}` : `Select Experiment ${idx + 1}`}
            </button>
            {dropdowns[key] && (
              <div className="absolute top-full left-0 w-auto min-w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1 max-h-60 overflow-y-auto">
                {experiments.map(e => (
                  <div
                    key={e.id}
                    className={`px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm ${
                      exps[idx]?.id === e.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-900'
                    }`}
                    onClick={() => { setExp(idx, e); closeDropdowns() }}
                  >
                    {e.title}
                  </div>
                ))}
                {experiments.length === 0 && (
                  <div className="px-4 py-2 text-gray-500 text-sm">No experiments found</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Metabolites + graph type row */}
      <div className="flex gap-3 flex-wrap">
        {expConfigs.map(({ metKey, idx, label }) => (
          <div key={metKey} className="relative overlay-dropdown">
            <button
              className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all disabled:opacity-50"
              onClick={() => toggleDropdown(metKey)}
              disabled={!datas[idx]}
            >
              Metabolites {idx + 1}
            </button>
            {dropdowns[metKey] && datas[idx] && (
              <div className="absolute top-full left-0 w-auto min-w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1 max-h-96 overflow-y-auto">
                {renderMetaboliteSections(datas[idx], metabolites[idx], (fn) => setMet(idx, fn), CHECKBOX_COLORS[idx])}
              </div>
            )}
          </div>
        ))}

        {/* Graph type */}
        <div className="relative overlay-dropdown">
          <button
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
            onClick={() => toggleDropdown('graphType')}
          >
            {graphType === 'line' ? 'Line' : 'Bar'}
          </button>
          {dropdowns.graphType && (
            <div className="absolute top-full left-0 min-w-28 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
              {(['line', 'bar'] as const).map(type => (
                <div key={type} className="px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm whitespace-nowrap"
                  onClick={() => { setGraphType(type); closeDropdowns() }}>
                  {type === 'line' ? 'Line Graph' : 'Bar Graph'}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Experiment descriptions */}
      <div className="flex gap-3 flex-wrap">
        {expConfigs.map(({ idx, label }) =>
          exps[idx] && (
            <div key={label} className="flex-1 min-w-[200px] p-3 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 text-sm">{label}: {exps[idx]!.title}</h3>
              <p className="text-gray-700 text-sm mt-1">{exps[idx]!.description}</p>
            </div>
          )
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#eb5234]" />
            <span className="text-gray-600 text-sm">Loading experiment data...</span>
          </div>
        </div>
      )}

      {/* Graph */}
      {!isLoading && (
        <div className="bg-white p-4 border border-gray-200 rounded-lg w-full" ref={containerRef}>
          <div className="overflow-x-auto overflow-y-hidden pb-3">
            <svg ref={svgRef} className="min-w-[500px]" />
          </div>
        </div>
      )}

      {/* Toggle switches */}
      <div className="flex gap-6 justify-center">
        {([
          { label: 'Variables', color: '#22c55e', state: showVariables, toggle: setShowVariables },
          { label: 'Events', color: '#3b82f6', state: showEvents, toggle: setShowEvents },
          { label: 'Anomalies', color: '#ef4444', state: showAnomalies, toggle: setShowAnomalies },
        ] as const).map(({ label, color, state, toggle }) => (
          <div key={label} className="flex items-center gap-2">
            <button
              onClick={() => toggle(!state)}
              className={`w-12 h-6 rounded-full transition-colors duration-200 ${state ? '' : 'bg-gray-300'}`}
              style={state ? { backgroundColor: color } : undefined}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                state ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </div>
        ))}
      </div>

      {/* Info panels */}
      <div className="space-y-3">
        {showVariables && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-900 mb-3">Variables</h4>
            <div className="flex gap-4">
              {expConfigs.map(({ idx, label }) =>
                datas[idx]?.variables && datas[idx]!.variables.length > 0 && (
                  <div key={label} className="flex-1">
                    <h5 className="font-medium text-green-800 text-sm mb-2">{label}: {exps[idx]?.title}</h5>
                    {datas[idx]!.variables.map((v, i) => (
                      <div key={i} className="flex justify-between text-sm text-green-900">
                        <span className="font-medium">{v.name}:</span>
                        <span>{v.value}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
              {!datas.some(d => d?.variables?.length) && (
                <p className="text-green-700 text-sm">No variables data</p>
              )}
            </div>
          </div>
        )}

        {showEvents && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-3">Events</h4>
            <div className="flex gap-4">
              {expConfigs.map(({ idx, label }) => {
                const textColors = ['text-blue-900', 'text-purple-900', 'text-emerald-900']
                return datas[idx]?.events && datas[idx]!.events.length > 0 && (
                  <div key={label} className="flex-1">
                    <h5 className={`font-medium text-sm mb-2 ${textColors[idx]}`}>{label}: {exps[idx]?.title}</h5>
                    {datas[idx]!.events.map((e, i) => (
                      <div key={i} className={`flex justify-between text-sm ${textColors[idx]}`}>
                        <span className="font-medium">{e.name}:</span>
                        <span>Time: {e.timepoint}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              {!datas.some(d => d?.events?.length) && (
                <p className="text-blue-700 text-sm">No events data</p>
              )}
            </div>
          </div>
        )}

        {showAnomalies && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-900 mb-3">Anomalies</h4>
            <div className="flex gap-4">
              {expConfigs.map(({ idx, label }) => {
                const textColors = ['text-red-900', 'text-orange-900', 'text-yellow-900']
                return datas[idx]?.anomalies && datas[idx]!.anomalies.length > 0 && (
                  <div key={label} className="flex-1">
                    <h5 className={`font-medium text-sm mb-2 ${textColors[idx]}`}>{label}: {exps[idx]?.title}</h5>
                    {datas[idx]!.anomalies.map((a, i) => (
                      <div key={i} className={`flex justify-between text-sm ${textColors[idx]}`}>
                        <span className="font-medium">{a.name}:</span>
                        <span>Time: {a.timepoint}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              {!datas.some(d => d?.anomalies?.length) && (
                <p className="text-red-700 text-sm">No anomalies data</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Overlay
