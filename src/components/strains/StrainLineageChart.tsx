'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'

interface StrainData {
  name: string
  parent: string | null
  experiment_count: number
  max_titers: Record<string, number>
}

interface TreeNode {
  name: string
  experiment_count: number
  max_titers: Record<string, number>
  children?: TreeNode[]
}

interface StrainLineageChartProps {
  selectedStrain?: string | null
  strains: StrainData[]
  availableProducts: string[]
  onSelectStrain?: (name: string) => void
}

export function StrainLineageChart({ selectedStrain, strains, availableProducts, onSelectStrain }: StrainLineageChartProps) {
  const [selectedProduct, setSelectedProduct] = useState('total')
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Set default product when availableProducts changes
  useEffect(() => {
    const defaultProd = availableProducts.find(p => p !== 'total') || 'total'
    setSelectedProduct(defaultProd)
  }, [availableProducts])

  const buildTree = useCallback((data: StrainData[]): TreeNode | null => {
    const root = data.find(s => s.parent === null)
    if (!root) return null

    const childMap: Record<string, StrainData[]> = {}
    data.forEach(s => {
      if (s.parent) {
        if (!childMap[s.parent]) childMap[s.parent] = []
        childMap[s.parent].push(s)
      }
    })

    const build = (s: StrainData): TreeNode => {
      const children = (childMap[s.name] || [])
        .sort((a, b) => {
          const na = parseInt(a.name), nb = parseInt(b.name)
          if (!isNaN(na) && !isNaN(nb)) return na - nb
          return a.name.localeCompare(b.name)
        })
        .map(build)
      return {
        name: s.name,
        experiment_count: s.experiment_count,
        max_titers: s.max_titers,
        ...(children.length > 0 ? { children } : {}),
      }
    }

    return build(root)
  }, [])

  const renderTree = useCallback(() => {
    if (!svgRef.current || !containerRef.current || strains.length === 0) return

    const treeData = buildTree(strains)
    if (!treeData) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const containerWidth = containerRef.current.clientWidth
    const root = d3.hierarchy(treeData)
    const treeDepth = root.height

    const margin = { top: 60, right: 20, bottom: 60, left: 20 }
    const height = Math.max(500, treeDepth * 80 + margin.top + margin.bottom + 100)
    const width = containerWidth
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    svg.attr('width', width).attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const layout = d3.tree<TreeNode>()
      .size([innerW, innerH])
      .separation((a, b) => a.parent === b.parent ? 1.5 : 2.5)

    const treeRoot = layout(root)

    // Titer scales
    const titerValues = strains.map(s => s.max_titers[selectedProduct] || 0).filter(v => v > 0)
    const maxTiter = titerValues.length > 0 ? Math.max(...titerValues) : 1
    const nodeCount = root.descendants().length
    const maxR = Math.min(35, innerW / (nodeCount * 1.5))
    const rScale = d3.scaleSqrt().domain([0, maxTiter]).range([6, Math.max(12, maxR)])
    const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxTiter])

    // Links
    g.selectAll('.link').data(treeRoot.links()).enter().append('path')
      .attr('fill', 'none').attr('stroke', '#ccc').attr('stroke-width', 2)
      .attr('d', d3.linkVertical<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
        .x(d => d.x).y(d => d.y))

    // Nodes
    const nodes = g.selectAll('.node').data(treeRoot.descendants()).enter().append('g')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', onSelectStrain ? 'pointer' : 'default')
      .on('click', (_event, d) => { onSelectStrain?.(d.data.name) })

    nodes.append('circle')
      .attr('r', d => rScale(d.data.max_titers[selectedProduct] || 0))
      .attr('fill', d => {
        if (selectedStrain && d.data.name === selectedStrain) return '#ef4444'
        const t = d.data.max_titers[selectedProduct] || 0
        return t > 0 ? colorScale(t) : '#e5e7eb'
      })
      .attr('stroke', d => selectedStrain && d.data.name === selectedStrain ? '#b91c1c' : '#374151')
      .attr('stroke-width', d => selectedStrain && d.data.name === selectedStrain ? 3 : 2)

    nodes.append('text')
      .attr('dy', d => {
        const r = rScale(d.data.max_titers[selectedProduct] || 0)
        return r > 20 ? 5 : r + 15
      })
      .attr('text-anchor', 'middle').attr('font-size', '12px').attr('font-weight', 'bold')
      .attr('fill', d => {
        const r = rScale(d.data.max_titers[selectedProduct] || 0)
        return r > 20 ? '#fff' : '#374151'
      })
      .text(d => d.data.name)

    // Tooltips
    nodes.append('title').text(d => {
      const titers = Object.entries(d.data.max_titers)
        .filter(([k]) => k !== 'total')
        .map(([k, v]) => `${k}: ${v.toFixed(1)}`)
        .join('\n')
      return `Strain: ${d.data.name}\nExperiments: ${d.data.experiment_count}\n${titers}\nTotal: ${d.data.max_titers.total?.toFixed(1) || 0}`
    })
  }, [strains, selectedProduct, selectedStrain, buildTree, onSelectStrain])

  useEffect(() => { renderTree() }, [renderTree])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => renderTree())
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [renderTree])

  if (strains.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-gray-500">No strain lineage data available</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b flex items-center justify-end">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Size by:</label>
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableProducts.map(p => (
              <option key={p} value={p}>{p === 'total' ? 'Total Titer' : p}</option>
            ))}
          </select>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-[500px] overflow-hidden">
        <svg ref={svgRef} className="w-full" />
      </div>
    </div>
  )
}

export default StrainLineageChart
