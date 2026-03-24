'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import * as d3 from 'd3'
import { ExperimentList } from '@/components/Shared/ExperimentList'

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
}

interface ExperimentDetail {
  experiment: {
    id: number
    title: string
    description: string
    experiment_note: string
    benchmark: string
    created_at: string
    updated_at: string
  }
  products: Product[]
  secondary_products: Product[]
  process_data: ProcessData[]
  unique_names?: {
    products?: string[]
    secondary_products?: string[]
    process_data?: string[]
  }
}

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

function Notes({ selectedExperiment }: { selectedExperiment: Experiment | null }) {
  const { getToken } = useAuth()
  const [data, setData] = useState<ExperimentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedExperiment) return
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      try {
        const token = await getToken()
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(selectedExperiment.title)}/`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) throw new Error('Failed to fetch')
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (err) {
        console.error('Error fetching experiment:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selectedExperiment, getToken])

  // Set default selections when data loads
  useEffect(() => {
    if (!data) return
    const defaults: Record<string, boolean> = {}
    data.unique_names?.products?.forEach(n => { defaults[n] = true })
    data.unique_names?.secondary_products?.forEach(n => { defaults[n] = false })
    data.unique_names?.process_data?.forEach(n => { defaults[n] = false })
    setSelected(defaults)
  }, [data])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.metabolites-dropdown')) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const renderGraph = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return

    d3.select(svgRef.current).selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth - 40
    const margin = { top: 20, right: 150, bottom: 50, left: 60 }
    const width = Math.max(containerWidth - margin.left - margin.right, 400)
    const height = 400 - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const timeSeriesData = [
      ...data.products.filter(p => selected[p.name]).map(p => ({
        time: parseTimepoint(p.timepoint), value: p.value, name: p.name, unit: p.unit,
      })),
      ...data.secondary_products.filter(p => selected[p.name]).map(p => ({
        time: parseTimepoint(p.timepoint), value: p.value, name: p.name, unit: p.unit,
      })),
      ...data.process_data.filter(p => selected[p.name]).map(p => ({
        time: parseFloat(p.time), value: p.value, name: p.name, unit: p.unit,
      })),
    ].sort((a, b) => a.time - b.time)

    if (timeSeriesData.length === 0) {
      svg.append('text')
        .attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle').attr('fill', '#666')
        .text('No data available — select metabolites to display')
      return
    }

    const groups = d3.group(timeSeriesData, d => d.name)
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(groups.keys()))

    const x = d3.scaleLinear()
      .domain([0, d3.max(timeSeriesData, d => d.time)!])
      .range([0, width])

    const y = d3.scaleLinear()
      .domain([0, d3.max(timeSeriesData, d => d.value)! * 1.1])
      .range([height, 0])

    const line = d3.line<{ time: number; value: number }>()
      .x(d => x(d.time)).y(d => y(d.value))

    svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(8))
    svg.append('g').call(d3.axisLeft(y))

    groups.forEach((pts, name) => {
      const sorted = pts.sort((a, b) => a.time - b.time)
      svg.append('path').datum(sorted)
        .attr('fill', 'none').attr('stroke', color(name)).attr('stroke-width', 2).attr('d', line)
      if (sorted.length <= 100) {
        svg.selectAll(null).data(sorted).enter().append('circle')
          .attr('cx', d => x(d.time)).attr('cy', d => y(d.value))
          .attr('r', 4).attr('fill', color(name)).attr('stroke', 'white').attr('stroke-width', 2)
      }
    })

    // Axis labels
    svg.append('text').attr('x', width / 2).attr('y', height + 40)
      .attr('text-anchor', 'middle').attr('font-size', '12px').text('Time (hr)')
    svg.append('text').attr('transform', 'rotate(-90)')
      .attr('x', -height / 2).attr('y', -45)
      .attr('text-anchor', 'middle').attr('font-size', '12px').text('Value')

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${width + 10}, 0)`)
    Array.from(groups.keys()).forEach((name, i) => {
      const item = legend.append('g').attr('transform', `translate(0, ${i * 20})`)
      item.append('rect').attr('width', 12).attr('height', 12).attr('fill', color(name))
      item.append('text').attr('x', 16).attr('y', 10).attr('font-size', '11px').text(name)
    })
  }, [data, selected])

  useEffect(() => { renderGraph() }, [renderGraph])

  useEffect(() => {
    const onResize = () => renderGraph()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [renderGraph])

  if (!selectedExperiment) {
    return (
      <div className="w-full min-h-[600px] bg-white rounded-lg shadow p-6 flex items-center justify-center text-gray-500">
        Select an experiment from the list to view notes
      </div>
    )
  }

  const checkboxSection = (label: string, names: string[] | undefined) => {
    if (!names?.length) return null
    return (
      <div className="p-3 border-b last:border-b-0">
        <h4 className="font-medium text-gray-900 mb-2 text-sm">{label}</h4>
        <div className="space-y-1">
          {names.map(name => (
            <label key={name} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected[name] || false}
                onChange={e => setSelected(prev => ({ ...prev, [name]: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{name}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-[600px] bg-white rounded-lg shadow">
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{selectedExperiment.title}</h1>

        <div className="bg-gray-50 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Experiment Description</h2>
          <p className="text-gray-600">{selectedExperiment.description || 'No description available'}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Experiment Notes</h2>
          <div className="min-h-[100px] text-gray-600 whitespace-pre-wrap">
            {data?.experiment?.experiment_note || 'No notes available for this experiment.'}
          </div>
        </div>

        {/* Graph */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Experiment Graph</h2>
            <div className="relative metabolites-dropdown">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              >
                Metabolites
              </button>
              {dropdownOpen && data && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] max-h-80 overflow-y-auto">
                  {checkboxSection('Products', data.unique_names?.products)}
                  {checkboxSection('Secondary Products', data.unique_names?.secondary_products)}
                  {checkboxSection('Process Variables', data.unique_names?.process_data)}
                </div>
              )}
            </div>
          </div>

          <div ref={containerRef} className="w-full">
            {loading ? (
              <div className="h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <svg ref={svgRef} />
              </div>
            )}
          </div>
        </div>

        {/* Comments placeholder */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Comments</h2>
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-gray-400 italic text-sm">No comments yet</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled
              />
              <button
                className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs opacity-50 cursor-not-allowed"
                disabled
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NotebookContent() {
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const searchParams = useSearchParams()

  // Auto-select experiment from URL query param
  useEffect(() => {
    const title = searchParams.get('experiment')
    if (title && experiments.length > 0 && !selectedExperiment) {
      const match = experiments.find(e => e.title === title)
      if (match) setSelectedExperiment(match)
    }
  }, [searchParams, experiments, selectedExperiment])

  const handleSelect = useCallback((experiment: Experiment) => {
    setSelectedExperiment(experiment)
    setIsMobileMenuOpen(false)
  }, [])

  const handleExperimentsChange = useCallback((exps: Experiment[]) => {
    setExperiments(exps)
  }, [])

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Mobile drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[85%] max-w-[320px] bg-white overflow-y-auto shadow-xl">
            <ExperimentList
              onExperimentSelect={handleSelect}
              onExperimentsChange={handleExperimentsChange}
              isMobileDrawer
            />
          </div>
        </div>
      )}

      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        {/* Mobile toggle */}
        <button
          className="md:hidden mb-3 h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          Experiments
        </button>

        <div className="flex flex-row gap-3 md:gap-5 lg:gap-6">
          {/* Desktop sidebar */}
          <div className="hidden md:block w-[364px] min-w-[364px] max-w-[416px] flex-shrink-0">
            <ExperimentList
              onExperimentSelect={handleSelect}
              onExperimentsChange={handleExperimentsChange}
            />
          </div>

          {/* Notes panel */}
          <div className="flex-1 min-w-0">
            <Notes selectedExperiment={selectedExperiment} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Notebook() {
  return (
    <Suspense fallback={
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <NotebookContent />
    </Suspense>
  )
}
