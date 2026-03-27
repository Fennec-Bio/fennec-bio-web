'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import * as d3 from 'd3'

interface ImpactEntry {
  variable: string
  product: string
  eta_squared: number
  f_statistic: number
  p_value: number
  n: number
  groups: number
  group_data: GroupData[]
}

interface GroupData {
  group: string
  values: number[]
  experiments: { title: string; titer: number; experiment_sets: string[] }[]
}

interface ApiResponse {
  products: string[]
  impacts: ImpactEntry[]
  rebuild_status: 'running' | 'completed' | 'failed' | null
}

export function VariableImpact() {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [allProducts, setAllProducts] = useState<string[]>([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [isRebuilding, setIsRebuilding] = useState(false)

  const heatmapRef = useRef<SVGSVGElement>(null)
  const boxplotRef = useRef<SVGSVGElement>(null)
  const boxplotContainerRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async (product?: string) => {
    setIsLoading(true)
    try {
      const token = await getToken()
      const searchParams = new URLSearchParams()
      if (product) searchParams.set('product', product)
      if (activeProject) searchParams.set('project_id', activeProject.id.toString())
      const qs = searchParams.toString()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/variable-impact/${qs ? '?' + qs : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error('Failed to fetch')
      const json: ApiResponse = await res.json()
      setData(json)
      if (!product) {
        setAllProducts(json.products)
        if (json.products.length > 0) {
          setSelectedProduct(json.products[0])
        }
      }
    } catch (err) {
      console.error('Error fetching variable impact:', err)
    } finally {
      setIsLoading(false)
    }
  }, [getToken, activeProject])

  // Poll for rebuild completion
  useEffect(() => {
    if (!isRebuilding || data?.rebuild_status !== 'running') return
    const interval = setInterval(() => {
      fetchData(selectedProduct || undefined)
    }, 3000)
    return () => clearInterval(interval)
  }, [isRebuilding, data?.rebuild_status, selectedProduct, fetchData])

  // Detect rebuild completion
  useEffect(() => {
    if (isRebuilding && data?.rebuild_status === 'completed') {
      setIsRebuilding(false)
      // Re-fetch without product filter to reload product list
      fetchData()
    }
  }, [isRebuilding, data?.rebuild_status, fetchData])

  const handleRebuild = async () => {
    setIsRebuilding(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/variable-impact/rebuild/`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!res.ok) {
        const err = await res.json()
        if (res.status === 409) {
          // Already running, just start polling
          return
        }
        throw new Error(err.error || 'Failed to trigger rebuild')
      }
      // Start polling
      fetchData(selectedProduct || undefined)
    } catch (err) {
      console.error('Rebuild failed:', err)
      setIsRebuilding(false)
    }
  }

  // Fetch on mount and when project changes
  useEffect(() => {
    setSelectedProduct('')
    setSelectedVariable(null)
    setAllProducts([])
    fetchData()
  }, [fetchData])

  // Re-fetch when product changes
  useEffect(() => {
    if (selectedProduct) fetchData(selectedProduct)
  }, [selectedProduct, fetchData])

  const impacts = data?.impacts ?? []

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.vi-product-dropdown')) setProductOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Render heatmap
  useEffect(() => {
    if (!heatmapRef.current || impacts.length === 0) return
    const svg = d3.select(heatmapRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 20, right: 60, bottom: 20, left: 120 }
    const width = 350 - margin.left - margin.right
    const barHeight = 28
    const height = impacts.length * barHeight

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3.scaleLinear().domain([0, 1]).range([0, width])
    const colorScale = d3.scaleLinear<string>().domain([0, 0.5, 1]).range(['#e5e7eb', '#60a5fa', '#1d4ed8'])

    g.selectAll('rect').data(impacts).enter().append('rect')
      .attr('x', 0).attr('y', (_, i) => i * barHeight + 2)
      .attr('width', d => xScale(d.eta_squared)).attr('height', barHeight - 4)
      .attr('fill', d => colorScale(d.eta_squared))
      .attr('stroke', d => d.variable === selectedVariable ? '#1e40af' : 'transparent')
      .attr('stroke-width', 2).attr('rx', 3).style('cursor', 'pointer')
      .on('click', (_, d) => setSelectedVariable(d.variable))

    g.selectAll('text.label').data(impacts).enter().append('text')
      .attr('class', 'label').attr('x', -5).attr('y', (_, i) => i * barHeight + barHeight / 2 + 4)
      .attr('text-anchor', 'end').attr('font-size', '12px')
      .attr('fill', d => d.variable === selectedVariable ? '#1e40af' : '#374151')
      .attr('font-weight', d => d.variable === selectedVariable ? 'bold' : 'normal')
      .style('cursor', 'pointer')
      .text(d => d.variable.length > 15 ? d.variable.slice(0, 15) + '...' : d.variable)
      .on('click', (_, d) => setSelectedVariable(d.variable))

    g.selectAll('text.value').data(impacts).enter().append('text')
      .attr('class', 'value')
      .attr('x', d => xScale(d.eta_squared) + 5).attr('y', (_, i) => i * barHeight + barHeight / 2 + 4)
      .attr('font-size', '11px').attr('fill', '#6b7280')
      .text(d => `${(d.eta_squared * 100).toFixed(0)}%`)

    g.selectAll('text.sig').data(impacts).enter().append('text')
      .attr('class', 'sig')
      .attr('x', d => xScale(d.eta_squared) + 35).attr('y', (_, i) => i * barHeight + barHeight / 2 + 4)
      .attr('font-size', '11px')
      .attr('fill', d => d.p_value < 0.05 ? '#16a34a' : '#9ca3af')
      .text(d => d.p_value < 0.001 ? '***' : d.p_value < 0.01 ? '**' : d.p_value < 0.05 ? '*' : '')
  }, [impacts, selectedVariable])

  // Render box plot
  const selectedImpact = impacts.find(i => i.variable === selectedVariable)
  const groupedData = selectedImpact?.group_data ?? []

  useEffect(() => {
    if (!boxplotRef.current || !selectedVariable || groupedData.length === 0) return
    const svg = d3.select(boxplotRef.current)
    svg.selectAll('*').remove()
    d3.selectAll('.vi-tooltip').remove()

    const containerWidth = boxplotContainerRef.current?.clientWidth || 800
    const margin = { top: 20, right: 40, bottom: 80, left: 70 }
    const width = containerWidth - margin.left - margin.right
    const height = 350 - margin.top - margin.bottom

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const uniqueGroups = [...new Set(groupedData.map(d => d.group))]
    const xScale = d3.scaleBand().domain(uniqueGroups).range([0, width]).padding(0.3)
    const allValues = groupedData.flatMap(d => d.values)
    const yExtent = d3.extent(allValues) as [number, number]
    const yPad = (yExtent[1] - yExtent[0]) * 0.1 || 10
    const yScale = d3.scaleLinear().domain([Math.max(0, yExtent[0] - yPad), yExtent[1] + yPad]).range([height, 0])

    const allSets = [...new Set(groupedData.flatMap(d => d.experiments.flatMap(e => e.experiment_sets.length > 0 ? e.experiment_sets : ['Unknown'])))]
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(allSets)

    g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xScale))
      .selectAll('text').attr('transform', 'rotate(-35)').attr('text-anchor', 'end')
      .attr('dx', '-0.5em').attr('dy', '0.5em').attr('font-size', '11px')
    g.append('g').call(d3.axisLeft(yScale).ticks(8))
      .append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -50)
      .attr('fill', '#374151').attr('text-anchor', 'middle').attr('font-size', '12px')
      .text(`${selectedProduct} (final titer)`)

    const tooltip = d3.select('body').append('div').attr('class', 'vi-tooltip')
      .style('position', 'absolute').style('visibility', 'hidden').style('background', 'white')
      .style('border', '1px solid #ccc').style('border-radius', '4px').style('padding', '8px')
      .style('font-size', '12px').style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)').style('z-index', '1000')

    const seen = new Set<string>()
    groupedData.forEach(group => {
      if (seen.has(group.group)) return
      seen.add(group.group)
      const values = [...group.values].sort(d3.ascending)
      if (values.length === 0) return
      const q1 = d3.quantile(values, 0.25)!
      const median = d3.quantile(values, 0.5)!
      const q3 = d3.quantile(values, 0.75)!
      const iqr = q3 - q1
      const min = Math.max(d3.min(values)!, q1 - 1.5 * iqr)
      const max = Math.min(d3.max(values)!, q3 + 1.5 * iqr)
      const mean = d3.mean(values)!
      const x = xScale(group.group)!
      const bw = xScale.bandwidth()

      g.append('rect').attr('x', x).attr('y', yScale(q3)).attr('width', bw).attr('height', yScale(q1) - yScale(q3))
        .attr('fill', '#dbeafe').attr('stroke', '#3b82f6').attr('stroke-width', 1.5)
      g.append('line').attr('x1', x).attr('x2', x + bw).attr('y1', yScale(median)).attr('y2', yScale(median))
        .attr('stroke', '#1e40af').attr('stroke-width', 2)
      g.append('path').attr('d', d3.symbol().type(d3.symbolDiamond).size(60))
        .attr('transform', `translate(${x + bw / 2}, ${yScale(mean)})`).attr('fill', '#ef4444').attr('stroke', 'white')

      const wx = x + bw / 2
      g.append('line').attr('x1', wx).attr('x2', wx).attr('y1', yScale(q3)).attr('y2', yScale(max))
        .attr('stroke', '#6b7280').attr('stroke-dasharray', '3,2')
      g.append('line').attr('x1', x + bw * 0.25).attr('x2', x + bw * 0.75).attr('y1', yScale(max)).attr('y2', yScale(max)).attr('stroke', '#6b7280')
      g.append('line').attr('x1', wx).attr('x2', wx).attr('y1', yScale(q1)).attr('y2', yScale(min))
        .attr('stroke', '#6b7280').attr('stroke-dasharray', '3,2')
      g.append('line').attr('x1', x + bw * 0.25).attr('x2', x + bw * 0.75).attr('y1', yScale(min)).attr('y2', yScale(min)).attr('stroke', '#6b7280')

      group.experiments.forEach(exp => {
        const jitter = (Math.random() - 0.5) * bw * 0.6
        g.append('circle').attr('cx', x + bw / 2 + jitter).attr('cy', yScale(exp.titer)).attr('r', 5)
          .attr('fill', colorScale(exp.experiment_sets[0] || 'Unknown')).attr('stroke', 'white').attr('opacity', 0.8)
          .style('cursor', 'pointer')
          .on('mouseover', () => {
            tooltip.style('visibility', 'visible').html(
              `<strong>${exp.title}</strong><br/>${selectedVariable}: ${group.group}<br/>Titer: ${exp.titer.toFixed(1)}<br/><span style="color:#6b7280">${exp.experiment_sets.length > 0 ? exp.experiment_sets.join(', ') : 'No set'}</span>`
            )
          })
          .on('mousemove', (event) => {
            tooltip.style('top', event.pageY - 10 + 'px').style('left', event.pageX + 10 + 'px')
          })
          .on('mouseout', () => tooltip.style('visibility', 'hidden'))
      })
    })

    return () => { d3.selectAll('.vi-tooltip').remove() }
  }, [selectedVariable, groupedData, selectedProduct])

  return (
    <div>
      <div>
        <div className="p-4">
          {/* Product selector */}
          <div className="mb-4 flex items-center gap-2">
            <div className="relative vi-product-dropdown inline-block">
              <button
                className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
                onClick={() => setProductOpen(!productOpen)}
              >
                Product: {selectedProduct || (data && allProducts.length === 0 ? 'No products available' : 'Loading...')}
              </button>
              {productOpen && allProducts.length > 0 && (
                <div className="absolute top-full left-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
                  {allProducts.map(p => (
                    <div key={p}
                      className={`px-4 py-2 cursor-pointer hover:bg-gray-100 text-sm ${p === selectedProduct ? 'bg-blue-50 font-medium' : ''}`}
                      onClick={() => { setSelectedProduct(p); setProductOpen(false); setSelectedVariable(null) }}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleRebuild}
              disabled={isRebuilding}
              className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRebuilding ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-gray-600" />
                  Rebuilding...
                </span>
              ) : (
                'Rebuild Analysis'
              )}
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#eb5234]" />
            </div>
          )}

          {!isLoading && impacts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No variable impact data available.</p>
              <button
                onClick={handleRebuild}
                disabled={isRebuilding}
                className="mt-3 h-9 px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium shadow-xs hover:bg-[#d4472c] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRebuilding ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    Rebuilding...
                  </span>
                ) : (
                  'Build Analysis'
                )}
              </button>
            </div>
          )}

          {!isLoading && impacts.length > 0 && (
            <div className="space-y-6">
              {/* Top row: Heatmap + Top Factors */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 overflow-auto">
                  <h3 className="font-semibold text-gray-900 mb-1">Variable Impact (eta sq.)</h3>
                  <p className="text-xs text-gray-500 mb-3">% of titer variance explained by each variable</p>
                  <svg ref={heatmapRef} />
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-1">Top Factors</h3>
                  <p className="text-xs text-gray-500 mb-3">Ranked by effect size (eta sq.)</p>
                  <div className="space-y-2">
                    {impacts.slice(0, 10).map((item, idx) => (
                      <button
                        key={`${item.variable}-${item.product}`}
                        onClick={() => setSelectedVariable(item.variable)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors ${
                          selectedVariable === item.variable ? 'bg-blue-100 border border-blue-300' : 'hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">{idx + 1}. {item.variable}</span>
                          <span className="text-sm font-mono text-blue-600">eta sq.={item.eta_squared.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>{item.groups} groups, n={item.n}</span>
                          <span className={item.p_value < 0.05 ? 'text-green-600 font-medium' : ''}>
                            {item.p_value < 0.001 ? 'p < 0.001 ***' : item.p_value < 0.01 ? 'p < 0.01 **' : item.p_value < 0.05 ? 'p < 0.05 *' : `p = ${item.p_value.toFixed(2)}`}
                          </span>
                        </div>
                      </button>
                    ))}
                    {impacts.length === 0 && <p className="text-sm text-gray-500">No variables with multiple groups</p>}
                  </div>
                </div>
              </div>

              {/* Box plot */}
              <div ref={boxplotContainerRef} className="bg-gray-50 rounded-lg p-4">
                {!selectedVariable ? (
                  <div className="flex items-center justify-center h-[350px]">
                    <p className="text-gray-500">Select a variable from the impact chart to see distribution by group</p>
                  </div>
                ) : groupedData.length === 0 ? (
                  <div className="flex items-center justify-center h-[350px]">
                    <p className="text-gray-500">No data available for this variable</p>
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold text-gray-900 mb-1">Titer Distribution by {selectedVariable}</h3>
                    <p className="text-xs text-gray-500 mb-3">Box plots show median, quartiles, whiskers. Diamond = mean.</p>
                    <svg ref={boxplotRef} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

export default VariableImpact
