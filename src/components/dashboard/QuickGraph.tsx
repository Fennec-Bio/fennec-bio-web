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
}

interface QuickGraphProps {
  selectedExperiment: Experiment | null
  onExperimentSelect?: (experiment: Experiment) => void
  experiments: Experiment[]
}

/** Parse a timepoint string like "2 hr", "96h", "15.16" into hours */
function parseTimepoint(timepoint: string): number {
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

export function QuickGraph({ selectedExperiment, onExperimentSelect, experiments }: QuickGraphProps) {
  const { getToken } = useAuth()
  const [experimentData, setExperimentData] = useState<ExperimentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
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

  // Reset and auto-select first experiment when experiments list changes (e.g. project switch)
  useEffect(() => {
    setExperimentData(null)
    setCurrentTitle(null)
    setSelectedMetabolites({})
    if (svgRef.current) {
      d3.select(svgRef.current).selectAll('*').remove()
    }
    if (experiments.length > 0) {
      setManualExperiment(experiments[0])
      onExperimentSelect?.(experiments[0])
    } else {
      setManualExperiment(null)
      onExperimentSelect?.(null as unknown as Experiment)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments])

  const getGraphDimensions = useCallback(() => {
    const w = containerRef.current?.clientWidth || 675
    const mobile = w < 500
    const legendSpace = mobile ? 100 : 180
    const width = Math.min(Math.max(w - legendSpace, mobile ? 280 : 420), mobile ? 500 : 750)
    return { width, height: Math.round(width * 0.72) }
  }, [])

  // Fetch experiment data when selection changes
  useEffect(() => {
    if (activeExperiment && activeExperiment.title !== currentTitle) {
      setCurrentTitle(activeExperiment.title)
      const fetchData = async () => {
        setIsLoading(true)
        try {
          const token = await getToken()
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(activeExperiment.title)}/`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          if (!res.ok) throw new Error('Failed to fetch')
          setExperimentData(await res.json())
        } catch (err) {
          console.error('Error fetching experiment data:', err)
        } finally {
          setIsLoading(false)
        }
      }
      fetchData()
    }
  }, [activeExperiment, currentTitle, getToken])

  // Set default metabolite selections when data loads
  useEffect(() => {
    if (!experimentData) return
    const defaults: Record<string, boolean> = {}
    experimentData.unique_names?.products?.forEach(n => { defaults[n] = true })
    experimentData.unique_names?.secondary_products?.forEach(n => { defaults[n] = false })
    experimentData.unique_names?.process_data?.forEach(n => { defaults[n] = false })
    setSelectedMetabolites(defaults)
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
      .map(p => ({
        time: parseTimepoint(p.timepoint),
        timepoint: p.timepoint,
        value: p.value,
        name: p.name,
        unit: p.unit,
        type: p.type,
      }))

    const processPoints = experimentData.process_data
      .filter(p => selectedMetabolites[p.name])
      .map(p => ({
        time: parseFloat(p.time),
        timepoint: p.time,
        value: p.value,
        name: p.name,
        unit: p.unit,
        type: 'process_data',
      }))

    return [...productData, ...processPoints].sort((a, b) => a.time - b.time)
  }, [experimentData, selectedMetabolites])

  // Draw vertical marker lines for events/anomalies
  const drawMarkers = useCallback((
    svg: d3.Selection<SVGGElement, unknown, null, undefined>,
    xScale: d3.ScaleLinear<number, number>,
    height: number,
    maxTime: number
  ) => {
    if (showEvents && experimentData?.events) {
      experimentData.events.forEach(event => {
        const t = parseTimepoint(event.timepoint)
        if (t >= 0 && t <= maxTime) {
          const x = xScale(t)
          svg.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height)
            .attr('stroke', '#3b82f6').attr('stroke-width', 2).attr('stroke-dasharray', '5,5').attr('opacity', 0.7)
          svg.append('text').attr('x', x).attr('y', -5).attr('text-anchor', 'middle')
            .attr('font-size', '10px').attr('font-weight', 'bold').attr('fill', '#3b82f6').text(event.name)
        }
      })
    }
    if (showAnomalies && experimentData?.anomalies) {
      experimentData.anomalies.forEach(anomaly => {
        if (!anomaly.timepoint) return
        const t = parseTimepoint(anomaly.timepoint)
        if (t >= 0 && t <= maxTime) {
          const x = xScale(t)
          svg.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height)
            .attr('stroke', '#ef4444').attr('stroke-width', 2).attr('stroke-dasharray', '5,5').attr('opacity', 0.7)
          svg.append('text').attr('x', x).attr('y', -5).attr('text-anchor', 'middle')
            .attr('font-size', '10px').attr('font-weight', 'bold').attr('fill', '#ef4444').text(anomaly.name)
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

      if (sorted.length <= 100 || sorted[0]?.type !== 'process_data') {
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
    const barData = [
      ...experimentData.products.filter(p => selectedMetabolites[p.name]).map(p => ({ ...p, type: 'product' })),
      ...experimentData.secondary_products.filter(p => selectedMetabolites[p.name]).map(p => ({ ...p, type: 'secondary_product' })),
    ].map(p => ({ time: parseTimepoint(p.timepoint), value: p.value, name: p.name, unit: p.unit, type: p.type }))

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
            {activeExperiment?.title || (experiments.length === 0 ? 'No experiments available' : 'Select Experiment')}
          </button>
          {experimentDropdownOpen && (
            <div className="absolute top-full left-0 w-auto min-w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1 max-h-60 overflow-y-auto">
              {experiments.map(exp => (
                <div
                  key={exp.id}
                  className={`px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm ${
                    activeExperiment?.id === exp.id ? 'bg-blue-50 text-blue-900 font-medium' : 'text-gray-900'
                  }`}
                  onClick={() => {
                    setManualExperiment(exp)
                    setExperimentDropdownOpen(false)
                    onExperimentSelect?.(exp)
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
          <h3 className="font-medium text-gray-900 text-sm">Experiment Description:</h3>
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

      {/* Graph */}
      {experimentData && !isLoading && (
        <>
          <div ref={containerRef} className="overflow-x-auto overflow-y-hidden pb-3">
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
            {showEvents && experimentData.events.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Events</h4>
                {experimentData.events.map((e, i) => (
                  <div key={i} className="flex justify-between text-sm text-blue-900">
                    <span className="font-medium">{e.name}:</span>
                    <span>Time: {e.timepoint}</span>
                  </div>
                ))}
              </div>
            )}
            {showAnomalies && experimentData.anomalies.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-medium text-red-900 mb-2">Anomalies</h4>
                {experimentData.anomalies.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm text-red-900">
                    <span className="font-medium">{a.name}:</span>
                    <span>Time: {a.timepoint}</span>
                  </div>
                ))}
              </div>
            )}
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
