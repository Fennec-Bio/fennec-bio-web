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
  data_type?: 'discrete' | 'continuous'
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
  note_images?: unknown[]
  comments?: unknown[]
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
  dataType?: 'discrete' | 'continuous'
}

interface QuickGraphProps {
  selectedExperiment: Experiment | null
  onExperimentSelect?: (experiment: Experiment) => void
  experiments: Experiment[]
}

/** Parse a timepoint string like "2 hr", "96h", "15:25:36" into hours */
function parseTimepoint(timepoint: string): number {
  // HH:MM:SS format (with optional fractional seconds)
  const hhmmss = timepoint.match(/^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (hhmmss) return parseInt(hhmmss[1]) + parseInt(hhmmss[2]) / 60 + parseFloat(hhmmss[3]) / 3600

  const match = timepoint.match(/(\d+(?:\.\d+)?)\s*(hr|hours?|h|min|minutes?|m|days?|d)/i)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2].toLowerCase()
    if (unit.includes('min') || unit === 'm') return num / 60
    if (unit.includes('day') || unit === 'd') return num * 24
    return num
  }
  const num = parseFloat(timepoint)
  return isNaN(num) ? 0 : num
}

/** Convert a raw numeric time value to hours based on its stored unit */
function normalizeToHours(rawTime: number, timeUnit?: string): number {
  if (timeUnit === 'minutes') return rawTime / 60
  if (timeUnit === 'days') return rawTime * 24
  return rawTime
}

/**
 * For hh:mm:ss series, detect midnight crossings and normalize so the first point starts at 0.
 * Assumes data points arrive in chronological array order.
 * Mutates the time values in the dataPoints array.
 */
function normalizeWallClockSeries(dataPoints: DataPoint[]): void {
  const groups = new Map<string, DataPoint[]>()
  for (const dp of dataPoints) {
    if (!groups.has(dp.name)) groups.set(dp.name, [])
    groups.get(dp.name)!.push(dp)
  }

  for (const [, points] of groups) {
    const isHHMMSS = points.some(p => /^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?$/.test(p.timepoint))
    if (!isHHMMSS) continue

    // Unwrap midnight crossings: if time drops by >12 hours from previous, add 24
    for (let i = 1; i < points.length; i++) {
      while (points[i].time < points[i - 1].time - 12) {
        points[i].time += 24
      }
    }

    // Subtract minimum so series starts at 0
    const minTime = Math.min(...points.map(p => p.time))
    for (const p of points) p.time -= minTime
  }
}

/** Downsample data to maxPoints for performance */
function decimateData<T>(data: T[], maxPoints: number = 1000): T[] {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  const result: T[] = [data[0]]
  for (let i = step; i < data.length - step; i += step) {
    result.push(data[i])
  }
  if (result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1])
  }
  return result
}

// Simple in-memory cache so switching between experiments is instant on revisit
const experimentCache = new Map<string, ExperimentDetail>()

export function QuickGraph({ selectedExperiment, onExperimentSelect, experiments }: QuickGraphProps) {
  const { getToken } = useAuth()
  const [experimentData, setExperimentData] = useState<ExperimentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingExtra, setIsLoadingExtra] = useState(false)
  const [showVariables, setShowVariables] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [metabolitesOpen, setMetabolitesOpen] = useState(false)
  const [experimentDropdownOpen, setExperimentDropdownOpen] = useState(false)
  const [graphType, setGraphType] = useState<'line' | 'bar'>('line')
  const [graphTypeOpen, setGraphTypeOpen] = useState(false)
  const [selectedMetabolites, setSelectedMetabolites] = useState<Record<string, boolean>>({})
  const [manualExperiment, setManualExperiment] = useState<Experiment | null>(null)
  const [currentTitle, setCurrentTitle] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeExperiment = manualExperiment || selectedExperiment

  // Reset graph state when experiments list changes (e.g. project switch)
  useEffect(() => {
    setExperimentData(null)
    setCurrentTitle(null)
    setSelectedMetabolites({})
    setManualExperiment(null)
    prevUniqueRef.current = ''
    fetchingTitleRef.current = null
    experimentCache.clear()
    if (svgRef.current) {
      d3.select(svgRef.current).selectAll('*').remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments])

  // Follow sidebar selection when no manual override — reset fetch ref to allow new fetch
  useEffect(() => {
    if (!manualExperiment && selectedExperiment) {
      fetchingTitleRef.current = null
    }
  }, [selectedExperiment, manualExperiment])

  const getGraphDimensions = useCallback(() => {
    const w = containerRef.current?.clientWidth || 675
    const mobile = w < 500
    const legendSpace = mobile ? 100 : 180
    const width = Math.min(Math.max(w - legendSpace, mobile ? 280 : 420), mobile ? 500 : 750)
    return { width, height: Math.round(width * 0.72) }
  }, [])

  // Track which title is being fetched so stale async results are ignored
  const fetchingTitleRef = useRef<string | null>(null)

  // Two-phase fetch: products first (fast graph render), then secondary + process data
  useEffect(() => {
    if (!activeExperiment) return
    const title = activeExperiment.title

    // Check cache first
    const cached = experimentCache.get(title)
    if (cached) {
      setExperimentData(cached)
      setCurrentTitle(title)
      setIsLoading(false)
      setIsLoadingExtra(false)
      return
    }

    // Skip if we're already fetching this title
    if (fetchingTitleRef.current === title) return

    fetchingTitleRef.current = title
    setCurrentTitle(title)

    const encodedTitle = encodeURIComponent(title)
    const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodedTitle}/`

    const fetchData = async () => {
      setIsLoading(true)
      setIsLoadingExtra(false)
      try {
        const token = await getToken()
        const headers = { Authorization: `Bearer ${token}` }

        // Phase 1: products + metadata (lightweight — renders graph immediately)
        const res1 = await fetch(
          `${baseUrl}?fields=products,variables,events,anomalies,unique_names`,
          { headers }
        )
        if (!res1.ok) throw new Error('Failed to fetch')
        const phase1 = await res1.json()

        // Stale check — user may have switched experiments
        if (fetchingTitleRef.current !== title) return
        const partial: ExperimentDetail = {
          ...phase1,
          secondary_products: phase1.secondary_products || [],
          process_data: phase1.process_data || [],
        }
        setExperimentData(partial)
        setIsLoading(false)
        setIsLoadingExtra(true)

        // Phase 2: secondary products + process data (heavier — loads in background)
        const res2 = await fetch(
          `${baseUrl}?fields=secondary_products,process_data,note_images,comments,unique_names&max_points=500`,
          { headers }
        )
        if (!res2.ok) throw new Error('Failed to fetch extra data')
        const phase2 = await res2.json()

        if (fetchingTitleRef.current !== title) return
        const full: ExperimentDetail = {
          ...partial,
          secondary_products: phase2.secondary_products || [],
          process_data: phase2.process_data || [],
          note_images: phase2.note_images,
          comments: phase2.comments,
          unique_names: {
            products: partial.unique_names?.products || [],
            secondary_products: phase2.unique_names?.secondary_products || [],
            process_data: phase2.unique_names?.process_data || [],
          },
        }
        setExperimentData(full)
        experimentCache.set(title, full)
      } catch (err) {
        console.error('Error fetching experiment data:', err)
      } finally {
        if (fetchingTitleRef.current === title) {
          setIsLoading(false)
          setIsLoadingExtra(false)
        }
      }
    }
    fetchData()
  }, [activeExperiment, getToken])

  // Set default metabolite selections when data loads.
  // Preserve existing selections when phase 2 data arrives (merges new names in as unchecked).
  const prevUniqueRef = useRef<string>('')
  useEffect(() => {
    if (!experimentData?.unique_names) return
    const allNames = [
      ...(experimentData.unique_names.products || []),
      ...(experimentData.unique_names.secondary_products || []),
      ...(experimentData.unique_names.process_data || []),
    ]
    const key = allNames.join(',')
    if (key === prevUniqueRef.current) return
    prevUniqueRef.current = key

    setSelectedMetabolites(prev => {
      const next: Record<string, boolean> = { ...prev }
      experimentData.unique_names?.products?.forEach(n => { if (!(n in next)) next[n] = true })
      experimentData.unique_names?.secondary_products?.forEach(n => { if (!(n in next)) next[n] = false })
      experimentData.unique_names?.process_data?.forEach(n => { if (!(n in next)) next[n] = false })
      return next
    })
  }, [experimentData])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Element
      if (metabolitesOpen && !t.closest('.metabolites-dropdown')) setMetabolitesOpen(false)
      if (experimentDropdownOpen && !t.closest('.experiment-dropdown')) setExperimentDropdownOpen(false)
      if (graphTypeOpen && !t.closest('.graph-type-dropdown')) setGraphTypeOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [metabolitesOpen, experimentDropdownOpen, graphTypeOpen])

  // Build combined data points from selected metabolites
  const buildDataPoints = useCallback((): DataPoint[] => {
    if (!experimentData) return []

    const productData = [
      ...experimentData.products.map(p => ({ ...p, type: 'product' })),
      ...experimentData.secondary_products.map(p => ({ ...p, type: 'secondary_product' })),
    ]
      .filter(p => selectedMetabolites[p.name])
      .map(p => {
        const rawTime = p.data_type === 'continuous' ? parseFloat(p.timepoint) : parseTimepoint(p.timepoint)
        return {
          time: normalizeToHours(rawTime, p.time_unit),
          timepoint: p.timepoint,
          value: p.value,
          name: p.name,
          unit: p.unit,
          type: p.type,
          dataType: p.data_type,
        }
      })

    const processPoints = experimentData.process_data
      .filter(p => selectedMetabolites[p.name])
      .map(p => ({
        time: normalizeToHours(
          p.time_unit === 'hh:mm:ss' ? parseTimepoint(p.time) : parseFloat(p.time),
          p.time_unit,
        ),
        timepoint: p.time,
        value: p.value,
        name: p.name,
        unit: p.unit,
        type: 'process_data',
      }))

    const allPoints = [...productData, ...processPoints]
    normalizeWallClockSeries(allPoints)
    return allPoints.sort((a, b) => a.time - b.time)
  }, [experimentData, selectedMetabolites])

  // Draw vertical marker lines for events/anomalies with numbered labels
  const drawMarkers = useCallback((
    svg: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    height: number,
    maxTime: number
  ) => {
    let markerNum = 1
    if (showEvents && experimentData?.events) {
      experimentData.events.forEach(event => {
        const t = parseTimepoint(event.timepoint)
        if (t >= 0 && t <= maxTime) {
          const x = xScale(t)
          const num = markerNum++
          svg.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height)
            .attr('stroke', '#3b82f6').attr('stroke-width', 2).attr('stroke-dasharray', '5,5').attr('opacity', 0.7)
          svg.append('text').attr('x', x).attr('y', -5).attr('text-anchor', 'middle')
            .attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', '#3b82f6').text(num)
        }
      })
    }
    if (showAnomalies && experimentData?.anomalies) {
      experimentData.anomalies.forEach(anomaly => {
        if (!anomaly.timepoint) return
        const t = parseTimepoint(anomaly.timepoint)
        if (t >= 0 && t <= maxTime) {
          const x = xScale(t)
          const num = markerNum++
          svg.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height)
            .attr('stroke', '#ef4444').attr('stroke-width', 2).attr('stroke-dasharray', '5,5').attr('opacity', 0.7)
          svg.append('text').attr('x', x).attr('y', -5).attr('text-anchor', 'middle')
            .attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', '#ef4444').text(num)
        }
      })
    }
  }, [showEvents, showAnomalies, experimentData])

  const renderLineGraph = useCallback(() => {
    if (!experimentData || !svgRef.current) return
    d3.select(svgRef.current).selectAll('*').remove()

    const margin = { top: 20, right: 130, bottom: 50, left: 60 }
    const { width: tw, height: th } = getGraphDimensions()
    const w = tw - margin.left - margin.right
    const h = th - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr('width', tw + 150).attr('height', th)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const data = buildDataPoints()
    if (data.length === 0) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2).attr('text-anchor', 'middle').attr('fill', '#666')
        .text('No data available — select metabolites above')
      return
    }

    const groups = d3.group(data, d => d.name)
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(groups.keys()))

    const xScale = d3.scaleLinear().domain([0, d3.max(data, d => d.time)!]).range([0, w])
    const yScale = d3.scaleLinear().domain([0, d3.max(data, d => d.value)!]).range([h, 0])
    const line = d3.line<DataPoint>().x(d => xScale(d.time)).y(d => yScale(d.value))

    svg.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xScale).ticks(5))
    svg.append('g').call(d3.axisLeft(yScale))

    groups.forEach((points, name) => {
      const sorted = points.sort((a, b) => a.time - b.time)
      const display = decimateData(sorted, 1000)

      svg.append('path').datum(display).attr('fill', 'none').attr('stroke', color(name)).attr('stroke-width', 2).attr('d', line)

      if ((sorted.length <= 100 || sorted[0]?.type !== 'process_data') && sorted[0]?.dataType !== 'continuous') {
        svg.selectAll(null).data(display).enter().append('circle')
          .attr('cx', d => xScale(d.time)).attr('cy', d => yScale(d.value))
          .attr('r', 4).attr('fill', color(name)).attr('stroke', 'white').attr('stroke-width', 2)
      }
    })

    drawMarkers(svg, xScale, h, d3.max(data, d => d.time)!)

    // Axis labels
    svg.append('text').attr('x', w / 2).attr('y', h + margin.bottom).attr('text-anchor', 'middle').attr('font-size', '12px').text('Time (hr)')
    svg.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -margin.left + 20).attr('text-anchor', 'middle').attr('font-size', '12px').text('Value')

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${w + 10}, ${h / 2 - groups.size * 10})`)
    Array.from(groups.keys()).forEach((name, i) => {
      const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`)
      g.append('rect').attr('width', 12).attr('height', 12).attr('fill', color(name))
      g.append('text').attr('x', 16).attr('y', 9).attr('font-size', '12px').text(name)
    })
  }, [experimentData, buildDataPoints, getGraphDimensions, drawMarkers])

  const renderBarGraph = useCallback(() => {
    if (!experimentData || !svgRef.current) return
    d3.select(svgRef.current).selectAll('*').remove()

    const margin = { top: 20, right: 130, bottom: 50, left: 60 }
    const { width: tw, height: th } = getGraphDimensions()
    const w = tw - margin.left - margin.right
    const h = th - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr('width', tw + 150).attr('height', th)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Bar graph only shows products/secondary products (not continuous process data)
    // Normalize timepoints to hours for display using stored time_unit
    const barData = [
      ...experimentData.products.filter(p => selectedMetabolites[p.name] && p.data_type !== 'continuous').map(p => ({ ...p, type: 'product' })),
      ...experimentData.secondary_products.filter(p => selectedMetabolites[p.name] && p.data_type !== 'continuous').map(p => ({ ...p, type: 'secondary_product' })),
    ].map(p => ({ time: normalizeToHours(parseTimepoint(p.timepoint), p.time_unit), value: p.value, name: p.name, unit: p.unit, type: p.type }))

    const timepoints = [...new Set(barData.map(p => p.time))].sort((a, b) => a - b)

    if (timepoints.length === 0) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2).attr('text-anchor', 'middle').attr('fill', '#666')
        .text('No product data available for bar chart')
      return
    }

    const xScale = d3.scaleBand().domain(timepoints.map(String)).range([0, w]).padding(0.1)
    const yScale = d3.scaleLinear().domain([0, d3.max(barData, d => d.value)!]).range([h, 0])
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain([...new Set(barData.map(d => d.name))])

    const displayTicks = timepoints.length > 5
      ? timepoints.filter((_, i) => i % Math.ceil(timepoints.length / 5) === 0)
      : timepoints
    svg.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale).tickValues(displayTicks.map(String)).tickFormat(d => `${d} hr`))
    svg.append('g').call(d3.axisLeft(yScale))

    barData.forEach(d => {
      const x = xScale(String(d.time))
      if (x !== undefined) {
        svg.append('rect').attr('x', x).attr('y', yScale(d.value))
          .attr('width', xScale.bandwidth()).attr('height', h - yScale(d.value))
          .attr('fill', color(d.name)).attr('stroke', 'white').attr('stroke-width', 1)
          .attr('opacity', d.type === 'secondary_product' ? 0.8 : 1)
      }
    })

    // Axis labels
    svg.append('text').attr('x', w / 2).attr('y', h + margin.bottom).attr('text-anchor', 'middle').attr('font-size', '12px').text('Time (hr)')
    svg.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -margin.left + 20).attr('text-anchor', 'middle').attr('font-size', '12px').text('Value')

    // Legend
    const uniqueNames = [...new Set(barData.map(d => d.name))]
    const legend = svg.append('g').attr('transform', `translate(${w + 10}, ${h / 2 - uniqueNames.length * 10})`)
    uniqueNames.forEach((name, i) => {
      const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`)
      g.append('rect').attr('width', 12).attr('height', 12).attr('fill', color(name))
      g.append('text').attr('x', 16).attr('y', 9).attr('font-size', '12px').text(name)
    })
  }, [experimentData, selectedMetabolites, getGraphDimensions])

  // Re-render graph when data/selections/type change
  useEffect(() => {
    if (!experimentData || !svgRef.current) return
    graphType === 'bar' ? renderBarGraph() : renderLineGraph()
  }, [experimentData, selectedMetabolites, graphType, showEvents, showAnomalies, renderLineGraph, renderBarGraph])

  // Debounced resize
  useEffect(() => {
    let timeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (experimentData && svgRef.current) {
          graphType === 'bar' ? renderBarGraph() : renderLineGraph()
        }
      }, 150)
    }
    window.addEventListener('resize', handleResize)
    return () => { clearTimeout(timeout); window.removeEventListener('resize', handleResize) }
  }, [experimentData, graphType, renderLineGraph, renderBarGraph])

  const toggleMetabolite = (name: string, checked: boolean) => {
    setSelectedMetabolites(prev => ({ ...prev, [name]: checked }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls row */}
      <div className="flex gap-3 w-full">
        {/* Experiment selector */}
        <div className="relative flex-1 experiment-dropdown">
          <button
            className="w-full h-9 px-4 py-2 rounded-md text-sm font-medium text-white shadow-xs hover:opacity-90 transition-all truncate"
            style={{ backgroundColor: '#eb5234' }}
            onClick={() => setExperimentDropdownOpen(!experimentDropdownOpen)}
          >
            {!manualExperiment && selectedExperiment
              ? `Selected: ${selectedExperiment.title}`
              : activeExperiment?.title || (experiments.length === 0 ? 'No experiments available' : 'Select Experiment')}
          </button>
          {experimentDropdownOpen && (
            <div className="absolute top-full left-0 w-auto min-w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1 max-h-60 overflow-y-auto">
              {selectedExperiment && (
                <div
                  className="px-4 py-2 cursor-pointer border-b border-gray-200 bg-gray-50 hover:bg-gray-100"
                  onClick={() => {
                    setManualExperiment(null)
                    setExperimentDropdownOpen(false)
                  }}
                >
                  <div className="font-medium text-sm text-gray-900">Currently Selected</div>
                  <div className="text-xs text-gray-500 mt-0.5">{selectedExperiment.title}</div>
                </div>
              )}
              {experiments.map(exp => (
                <div
                  key={exp.id}
                  className={`px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm ${
                    activeExperiment?.id === exp.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-900'
                  }`}
                  onClick={() => {
                    setManualExperiment(exp)
                    setExperimentDropdownOpen(false)
                  }}
                >
                  {exp.title}
                </div>
              ))}
              {experiments.length === 0 && (
                <div className="px-4 py-2 text-gray-500 text-sm">No experiments found</div>
              )}
            </div>
          )}
        </div>

        {/* Graph type */}
        <div className="relative graph-type-dropdown">
          <button
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
            onClick={() => setGraphTypeOpen(!graphTypeOpen)}
          >
            {graphType === 'line' ? 'Line' : 'Bar'}
          </button>
          {graphTypeOpen && (
            <div className="absolute top-full left-0 min-w-28 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
              {(['line', 'bar'] as const).map(type => (
                <div key={type} className="px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm whitespace-nowrap"
                  onClick={() => { setGraphType(type); setGraphTypeOpen(false) }}>
                  {type === 'line' ? 'Line Graph' : 'Bar Graph'}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metabolites dropdown */}
        <div className="relative metabolites-dropdown">
          <button
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
            onClick={() => setMetabolitesOpen(!metabolitesOpen)}
          >
            Metabolites
          </button>
          {metabolitesOpen && experimentData && (
            <div className="absolute top-full right-0 w-auto min-w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1 max-h-96 overflow-y-auto">
              {([
                { label: 'Products', items: experimentData.unique_names?.products },
                { label: 'Secondary Products', items: experimentData.unique_names?.secondary_products },
                { label: 'Process Data', items: experimentData.unique_names?.process_data },
              ] as const).map(section => (
                section.items && section.items.length > 0 && (
                  <div key={section.label} className="p-3 border-b last:border-b-0">
                    <h4 className="font-medium text-gray-900 mb-2 text-sm">{section.label}</h4>
                    <div className="space-y-1.5">
                      {section.items.map(name => (
                        <label key={name} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedMetabolites[name] || false}
                            onChange={e => toggleMetabolite(name, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {activeExperiment && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-gray-900 text-sm">Experiment Summary:</h3>
          <p className="text-gray-700 text-sm mt-1 line-clamp-4 min-h-[5rem]">{activeExperiment.description}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#eb5234]" />
            <span className="text-gray-600 text-sm">Loading experiment data...</span>
          </div>
        </div>
      )}

      {/* Phase 2 loading indicator */}
      {isLoadingExtra && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500">
          <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400" />
          Loading secondary products &amp; process data...
        </div>
      )}

      {/* Graph */}
      {experimentData && !isLoading && (
        <>
          <div
            ref={containerRef}
            className="overflow-x-auto overflow-y-hidden pb-3 cursor-pointer"
            onClick={() => {
              const title = activeExperiment?.title
              if (title) {
                window.open(`/notebook?experiment=${encodeURIComponent(title)}`, '_blank')
              }
            }}
            title="Click to open in Notebook"
          >
            <svg ref={svgRef} className="min-w-max" />
          </div>

          {/* Toggle switches */}
          <div className="flex gap-6 justify-center">
            {([
              { key: 'variables', label: 'Variables', color: 'green', state: showVariables, toggle: setShowVariables },
              { key: 'events', label: 'Events', color: 'blue', state: showEvents, toggle: setShowEvents },
              { key: 'anomalies', label: 'Anomalies', color: 'red', state: showAnomalies, toggle: setShowAnomalies },
            ] as const).map(({ key, label, color, state, toggle }) => (
              <div key={key} className="flex items-center gap-2">
                <button
                  onClick={() => toggle(!state)}
                  className={`w-12 h-6 rounded-full transition-colors duration-200 ${
                    state ? `bg-${color}-500` : 'bg-gray-300'
                  }`}
                  style={state ? { backgroundColor: color === 'green' ? '#22c55e' : color === 'blue' ? '#3b82f6' : '#ef4444' } : undefined}
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
            {showVariables && experimentData.variables.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-900 mb-2">Variables</h4>
                {experimentData.variables.map((v, i) => (
                  <div key={i} className="flex justify-between text-sm text-green-900">
                    <span className="font-medium">{v.name}:</span>
                    <span>{v.value}</span>
                  </div>
                ))}
              </div>
            )}
            {showEvents && experimentData.events.length > 0 && (() => {
              let num = 1
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Events</h4>
                  {experimentData.events.map((e, i) => (
                    <div key={i} className="flex gap-2 text-sm text-blue-900">
                      <span className="font-bold min-w-[1.5rem]">{num++}.</span>
                      <span className="font-medium flex-1">{e.name}</span>
                      <span className="text-blue-700">({e.timepoint}h)</span>
                    </div>
                  ))}
                </div>
              )
            })()}
            {showAnomalies && experimentData.anomalies.length > 0 && (() => {
              let num = 1 + (showEvents ? experimentData.events.length : 0)
              return (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-900 mb-2">Anomalies</h4>
                  {experimentData.anomalies.map((a, i) => (
                    <div key={i} className="flex gap-2 text-sm text-red-900">
                      <span className="font-bold min-w-[1.5rem]">{num++}.</span>
                      <span className="font-medium flex-1">{a.name}</span>
                      <span className="text-red-700">({a.timepoint}h)</span>
                    </div>
                  ))}
                </div>
              )
            })()}
            {showVariables && experimentData.variables.length === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center text-green-700 text-sm">No variables data</div>
            )}
            {showEvents && experimentData.events.length === 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center text-blue-700 text-sm">No events data</div>
            )}
            {showAnomalies && experimentData.anomalies.length === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center text-red-700 text-sm">No anomalies data</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default QuickGraph
