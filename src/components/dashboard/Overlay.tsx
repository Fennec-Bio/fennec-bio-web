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
  data_type?: 'discrete' | 'continuous' | 'point'
  time_unit?: string
}

interface ProcessData {
  id: number
  name: string
  unit: string
  time: string
  value: number
  type?: string
  time_unit?: string
  data_type?: 'discrete' | 'continuous' | 'point'
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
  dataType?: 'discrete' | 'continuous' | 'point'
  experimentPrefix: string
}

interface PointSeries {
  name: string
  value: number
  unit: string
  experimentPrefix: string
  experimentTitle: string
}

interface OverlayProps {
  experiments: Experiment[]
  preselectedExperiments?: Experiment[] | null
}

const EXP_COLORS = [
  d3.schemeCategory10,
  ['#e377c2', '#7f7f7f', '#bcbd22', '#17becf', '#9467bd', '#8c564b', '#d62728', '#2ca02c', '#ff7f0e', '#1f77b4'],
  ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3', '#1b9e77', '#d95f02'],
]

const CHECKBOX_COLORS = ['text-blue-600', 'text-purple-600', 'text-emerald-600']

function parseTimepoint(tp: string | number): number {
  if (tp === null || tp === undefined) return 0
  const s = String(tp)
  const hhmmss = s.match(/^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (hhmmss) return parseInt(hhmmss[1]) + parseInt(hhmmss[2]) / 60 + parseFloat(hhmmss[3]) / 3600

  const match = s.match(/(\d+(?:\.\d+)?)\s*(hr|hours?|h|min|minutes?|m|days?|d)/i)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2].toLowerCase()
    if (unit.includes('min') || unit === 'm') return num / 60
    if (unit.includes('day') || unit === 'd') return num * 24
    return num
  }
  const num = parseFloat(s)
  return isNaN(num) ? 0 : num
}

function normalizeToHours(rawTime: number, timeUnit?: string): number {
  if (timeUnit === 'minutes') return rawTime / 60
  if (timeUnit === 'days') return rawTime * 24
  return rawTime
}

function normalizeWallClockSeries(dataPoints: DataPoint[]): void {
  const groups = new Map<string, DataPoint[]>()
  for (const dp of dataPoints) {
    const key = `${dp.experimentPrefix}:${dp.name}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(dp)
  }

  for (const [, points] of groups) {
    const isHHMMSS = points.some(p => /^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?$/.test(p.timepoint))
    if (!isHHMMSS) continue

    for (let i = 1; i < points.length; i++) {
      while (points[i].time < points[i - 1].time - 12) {
        points[i].time += 24
      }
    }

    const minTime = Math.min(...points.map(p => p.time))
    for (const p of points) p.time -= minTime
  }
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

export function Overlay({ experiments, preselectedExperiments }: OverlayProps) {
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
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(title)}/?fields=products,secondary_products,process_data,variables,events,anomalies,unique_names&max_points=200`,
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

  // Track which titles are currently loaded to avoid redundant fetches
  const loadedTitlesRef = useRef<(string | null)[]>([null, null, null])

  // Fetch data when individual experiment slots change
  useEffect(() => {
    exps.forEach((exp, idx) => {
      const title = exp?.title ?? null
      if (title === loadedTitlesRef.current[idx]) return
      loadedTitlesRef.current[idx] = title
      if (title) fetchExperimentData(title, idx)
      else setData(idx, null)
    })
  }, [exps, fetchExperimentData])

  // Auto-populate slots when an experiment set is selected — fetch all in parallel
  useEffect(() => {
    if (!preselectedExperiments || preselectedExperiments.length === 0) return
    const newExps: (Experiment | null)[] = [null, null, null]
    for (let i = 0; i < Math.min(preselectedExperiments.length, 3); i++) {
      newExps[i] = preselectedExperiments[i]
    }
    setDatas([null, null, null])
    setMetabolites([{}, {}, {}])
    loadedTitlesRef.current = [null, null, null]

    // Fire all fetches in parallel
    const fetchAll = async () => {
      const token = await getToken()
      const promises = newExps.map(async (exp, idx) => {
        if (!exp) return
        setLoading(idx, true)
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(exp.title)}/?fields=products,secondary_products,process_data,variables,events,anomalies,unique_names&max_points=200`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          if (res.ok) {
            const data = await res.json()
            setData(idx, data)
            loadedTitlesRef.current[idx] = exp.title
          }
        } catch (err) {
          console.error('Error fetching experiment data:', err)
        } finally {
          setLoading(idx, false)
        }
      })
      await Promise.all(promises)
    }
    fetchAll()
    setExps(newExps)
  }, [preselectedExperiments, getToken])

  const initMetabolites = (data: ExperimentDetail | null): Record<string, boolean> => {
    if (!data) return {}
    const defaults: Record<string, boolean> = {}
    data.unique_names?.products?.forEach(n => { defaults[n] = true })
    data.unique_names?.secondary_products?.forEach(n => { defaults[n] = false })
    data.unique_names?.process_data?.forEach(n => { defaults[n] = false })
    return defaults
  }

  const data0 = datas[0]
  const data1 = datas[1]
  const data2 = datas[2]
  useEffect(() => { setMetabolites(prev => { const n = [...prev]; n[0] = initMetabolites(data0); return n }) }, [data0])
  useEffect(() => { setMetabolites(prev => { const n = [...prev]; n[1] = initMetabolites(data1); return n }) }, [data1])
  useEffect(() => { setMetabolites(prev => { const n = [...prev]; n[2] = initMetabolites(data2); return n }) }, [data2])

  const processExpData = useCallback((
    data: ExperimentDetail, selected: Record<string, boolean>, prefix: string, title: string,
  ): { plot: DataPoint[]; points: PointSeries[] } => {
    const productPoints = [
      ...data.products.map(p => ({ ...p, type: 'product' })),
      ...data.secondary_products.map(p => ({ ...p, type: 'secondary_product' })),
    ]
      .filter(p => selected[p.name])
      .map(p => ({
        time: normalizeToHours(
          p.data_type === 'continuous' ? parseFloat(p.timepoint) : parseTimepoint(p.timepoint),
          p.time_unit,
        ),
        timepoint: p.timepoint,
        value: p.value, name: p.name, unit: p.unit, type: p.type,
        dataType: p.data_type, experimentPrefix: prefix,
      }))

    const processPoints = data.process_data
      .filter(p => selected[p.name])
      .map(p => ({
        time: normalizeToHours(
          p.time_unit === 'hh:mm:ss' ? parseTimepoint(p.time) : parseFloat(p.time),
          p.time_unit,
        ), timepoint: p.time,
        value: p.value, name: p.name, unit: p.unit, type: 'process_data', experimentPrefix: prefix,
        dataType: p.data_type,
      }))

    const allPoints = [...productPoints, ...processPoints]

    // Partition by series name within this experiment.
    const groups = new Map<string, DataPoint[]>()
    for (const p of allPoints) {
      if (!groups.has(p.name)) groups.set(p.name, [])
      groups.get(p.name)!.push(p)
    }

    const plot: DataPoint[] = []
    const points: PointSeries[] = []
    for (const [name, rows] of groups) {
      const allPoint = rows.every(r => r.dataType === 'point')
      const anyPoint = rows.some(r => r.dataType === 'point')
      if (allPoint) {
        if (rows.length > 1) {
          console.warn(`[Overlay] point series "${prefix}:${name}" has ${rows.length} rows; showing only the first`)
        }
        const first = rows[0]
        points.push({ name, value: first.value, unit: first.unit, experimentPrefix: prefix, experimentTitle: title })
      } else {
        if (anyPoint) {
          console.warn(`[Overlay] series "${prefix}:${name}" mixes 'point' and other data_types; rendering as time series`)
        }
        plot.push(...rows)
      }
    }

    normalizeWallClockSeries(plot)
    plot.sort((a, b) => a.time - b.time)
    return { plot, points }
  }, [])

  const buildAllData = useCallback(() => {
    const all: DataPoint[] = []
    for (let i = 0; i < 3; i++) {
      if (datas[i]) all.push(...processExpData(datas[i]!, metabolites[i], `Exp${i + 1}`, exps[i]?.title ?? `Exp${i + 1}`).plot)
    }
    return all
  }, [datas, metabolites, exps, processExpData])

  const buildAllPointSeries = useCallback((): PointSeries[] => {
    const all: PointSeries[] = []
    for (let i = 0; i < 3; i++) {
      if (datas[i]) all.push(...processExpData(datas[i]!, metabolites[i], `Exp${i + 1}`, exps[i]?.title ?? `Exp${i + 1}`).points)
    }
    return all
  }, [datas, metabolites, exps, processExpData])

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
      if ((sorted.length <= 100 || sorted[0]?.type !== 'process_data') && sorted[0]?.dataType !== 'continuous') {
        svg.selectAll(null).data(display).enter().append('circle')
          .attr('cx', d => xScale(d.time)).attr('cy', d => yScale(d.value))
          .attr('r', 4).attr('fill', colorMap.get(key)!).attr('stroke', 'white').attr('stroke-width', 2)
      }
    })

    // Axis labels
    svg.append('text').attr('x', w / 2).attr('y', h + 40).attr('text-anchor', 'middle').attr('font-size', '12px').text('Time (hr)')
    svg.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -50).attr('text-anchor', 'middle').attr('font-size', '12px').text('Value')

    // Legend (label includes unit when known: "Exp1: CBDa (mg/L)")
    const legend = svg.append('g').attr('transform', `translate(${w + 20}, 10)`)
    Array.from(groups.entries()).forEach(([key, pts], i) => {
      const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`)
      g.append('rect').attr('width', 12).attr('height', 12).attr('fill', colorMap.get(key)!)
      const unit = pts[0]?.unit
      const label = unit ? `${key} (${unit})` : key
      g.append('text').attr('x', 16).attr('y', 9).attr('font-size', '11px').text(label)
    })
  }, [datas, getGraphDimensions, buildAllData])

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

    const allData = buildAllData().filter(d => d.dataType !== 'continuous' && d.dataType !== 'point' && d.type !== 'process_data')

    if (allData.length === 0) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('fill', '#666')
        .text('No discrete product data available for bar chart')
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
      const unit = groups.get(key)?.[0]?.unit
      const label = unit ? `${key} (${unit})` : key
      g.append('text').attr('x', 16).attr('y', 9).attr('font-size', '11px').text(label)
    })
  }, [datas, getGraphDimensions, buildAllData])

  // Render on data/selection changes
  useEffect(() => {
    if (!svgRef.current) return
    if (graphType === 'bar') renderBarGraph()
    else renderLineGraph()
  }, [datas, metabolites, graphType, renderLineGraph, renderBarGraph])

  // Debounced resize
  useEffect(() => {
    let timeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (svgRef.current && datas.some(d => d)) {
          if (graphType === 'bar') renderBarGraph()
          else renderLineGraph()
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
        <div key={section.label} className="p-3 border-b border-gray-200 last:border-b-0">
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
        {expConfigs.map(({ metKey, idx }) => (
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
          {(() => {
            const points = buildAllPointSeries()
            if (points.length === 0) return null
            return (
              <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div className="text-xs font-medium text-gray-500 mb-1.5">Single-point measurements</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {points.map((p, i) => (
                    <div key={`${p.experimentPrefix}-${p.name}-${i}`} className="text-sm text-gray-700">
                      <span className="text-gray-500">{p.experimentTitle} – </span>
                      <span className="font-medium">{p.name}:</span>{' '}
                      <span>{p.value}{p.unit ? ` ${p.unit}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
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

        {showEvents && (() => {
          let num = 1
          return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-3">Events</h4>
              <div className="flex gap-4">
                {expConfigs.map(({ idx, label }) => {
                  const textColors = ['text-blue-900', 'text-purple-900', 'text-emerald-900']
                  return datas[idx]?.events && datas[idx]!.events.length > 0 && (
                    <div key={label} className="flex-1">
                      <h5 className={`font-medium text-sm mb-2 ${textColors[idx]}`}>{label}: {exps[idx]?.title}</h5>
                      {datas[idx]!.events.map((e, i) => (
                        <div key={i} className={`flex gap-2 text-sm ${textColors[idx]}`}>
                          <span className="font-bold min-w-[1.5rem]">{num++}.</span>
                          <span className="font-medium flex-1">{e.name}</span>
                          <span className="opacity-75">({e.timepoint}h)</span>
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
          )
        })()}

        {showAnomalies && (() => {
          // Continue numbering after events
          let num = 1 + (showEvents ? datas.reduce((sum, d) => sum + (d?.events?.length || 0), 0) : 0)
          return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-900 mb-3">Anomalies</h4>
              <div className="flex gap-4">
                {expConfigs.map(({ idx, label }) => {
                  const textColors = ['text-red-900', 'text-orange-900', 'text-yellow-900']
                  return datas[idx]?.anomalies && datas[idx]!.anomalies.length > 0 && (
                    <div key={label} className="flex-1">
                      <h5 className={`font-medium text-sm mb-2 ${textColors[idx]}`}>{label}: {exps[idx]?.title}</h5>
                      {datas[idx]!.anomalies.map((a, i) => (
                        <div key={i} className={`flex gap-2 text-sm ${textColors[idx]}`}>
                          <span className="font-bold min-w-[1.5rem]">{num++}.</span>
                          <span className="font-medium flex-1">{a.name}</span>
                          <span className="opacity-75">({a.timepoint}h)</span>
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
          )
        })()}
      </div>
    </div>
  )
}

export default Overlay
