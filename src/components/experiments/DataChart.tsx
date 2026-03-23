'use client'

import React, { useRef, useEffect } from 'react'
import * as d3 from 'd3'

interface DataPoint {
  timepoint: string
  value: number
}

interface DataChartProps {
  data: DataPoint[]
  name: string
  unit?: string
}

function parseTime(tp: string): number {
  const n = parseFloat(tp)
  return isNaN(n) ? 0 : n
}

export function DataChart({ data, name, unit }: DataChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 16, right: 24, bottom: 32, left: 48 }
    const width = svgRef.current.clientWidth - margin.left - margin.right
    const height = 180 - margin.top - margin.bottom

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const sorted = [...data].sort((a, b) => parseTime(a.timepoint) - parseTime(b.timepoint))
    const x = d3.scaleLinear()
      .domain(d3.extent(sorted, d => parseTime(d.timepoint)) as [number, number])
      .range([0, width])

    const y = d3.scaleLinear()
      .domain([0, d3.max(sorted, d => d.value) ?? 0])
      .nice()
      .range([height, 0])

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-width).tickFormat(() => ''))
      .call(g => g.selectAll('line').attr('stroke', '#f3f4f6'))
      .call(g => g.select('.domain').remove())

    const area = d3.area<DataPoint>()
      .x(d => x(parseTime(d.timepoint)))
      .y0(height)
      .y1(d => y(d.value))

    g.append('path')
      .datum(sorted)
      .attr('fill', 'rgba(235, 82, 52, 0.08)')
      .attr('d', area)

    const line = d3.line<DataPoint>()
      .x(d => x(parseTime(d.timepoint)))
      .y(d => y(d.value))

    g.append('path')
      .datum(sorted)
      .attr('fill', 'none')
      .attr('stroke', '#eb5234')
      .attr('stroke-width', 2)
      .attr('d', line)

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6))
      .call(g => g.select('.domain').attr('stroke', '#e5e7eb'))

    g.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .call(g => g.select('.domain').attr('stroke', '#e5e7eb'))

  }, [data, name, unit])

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-700">{name}</span>
        {unit && <span className="text-xs text-gray-400">({unit})</span>}
      </div>
      <svg ref={svgRef} width="100%" height={180} />
    </div>
  )
}
