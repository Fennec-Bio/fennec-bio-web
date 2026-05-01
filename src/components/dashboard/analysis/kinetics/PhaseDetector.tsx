'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Phase, PhaseName } from '@/lib/analysis/kineticsUtils'

interface PhaseDetectorProps {
  timepoints: number[]
  biomassValues: number[]
  productTimepoints?: number[]
  productValues?: number[]
  phases: Phase[]
  productName?: string
  biomassName?: string
}

const phaseColors: Record<PhaseName, string> = {
  lag: '#fef3c7',
  exponential: '#dbeafe',
  stationary: '#ede9fe',
}

const phaseLabels: Record<PhaseName, string> = {
  lag: 'Lag',
  exponential: 'Exponential',
  stationary: 'Stationary',
}

export function PhaseDetector({
  timepoints,
  biomassValues,
  productTimepoints,
  productValues,
  phases,
  productName,
  biomassName = 'Biomass',
}: PhaseDetectorProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || timepoints.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 30, right: 80, bottom: 50, left: 60 }
    const width = 600 - margin.left - margin.right
    const height = 350 - margin.top - margin.bottom

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const biomassData = timepoints
      .map((t, i) => ({ time: t, value: biomassValues[i] }))
      .filter((d) => d.value > 0)
      .sort((a, b) => a.time - b.time)
    if (biomassData.length === 0) return

    const xExtent = d3.extent(biomassData, (d) => d.time) as [number, number]
    const xScale = d3.scaleLinear().domain(xExtent).range([0, width])

    const biomassExtent = d3.extent(biomassData, (d) => d.value) as [number, number]
    const biomassScale = d3.scaleLinear()
      .domain([0, biomassExtent[1] * 1.1])
      .range([height, 0])

    phases.forEach((phase) => {
      const x1 = xScale(Math.max(phase.startTime, xExtent[0]))
      const x2 = xScale(Math.min(phase.endTime, xExtent[1]))
      g.append('rect')
        .attr('x', x1).attr('y', 0)
        .attr('width', x2 - x1).attr('height', height)
        .attr('fill', phaseColors[phase.name])
        .attr('opacity', 0.6)
      g.append('text')
        .attr('x', (x1 + x2) / 2).attr('y', 15)
        .attr('text-anchor', 'middle').attr('font-size', '11px')
        .attr('font-weight', '500').attr('fill', '#374151')
        .text(phaseLabels[phase.name])
    })

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(8))
      .selectAll('text').attr('fill', '#374151')

    g.append('text')
      .attr('x', width / 2).attr('y', height + 40)
      .attr('text-anchor', 'middle').attr('fill', '#374151')
      .text('Time (h)')

    g.append('g')
      .call(d3.axisLeft(biomassScale).ticks(6))
      .selectAll('text').attr('fill', '#374151')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2).attr('y', -45)
      .attr('text-anchor', 'middle').attr('fill', '#2563eb')
      .text(biomassName)

    const biomassLine = d3.line<{ time: number; value: number }>()
      .x((d) => xScale(d.time))
      .y((d) => biomassScale(d.value))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(biomassData)
      .attr('fill', 'none').attr('stroke', '#2563eb').attr('stroke-width', 2.5)
      .attr('d', biomassLine)

    g.selectAll('.biomass-point')
      .data(biomassData)
      .enter().append('circle')
      .attr('class', 'biomass-point')
      .attr('cx', (d) => xScale(d.time))
      .attr('cy', (d) => biomassScale(d.value))
      .attr('r', 4).attr('fill', '#2563eb')
      .attr('stroke', 'white').attr('stroke-width', 1.5)

    if (productTimepoints && productValues && productTimepoints.length > 0) {
      const productData = productTimepoints
        .map((t, i) => ({ time: t, value: productValues[i] }))
        .filter((d) => d.time >= xExtent[0] && d.time <= xExtent[1])
        .sort((a, b) => a.time - b.time)

      if (productData.length > 0) {
        const productExtent = d3.extent(productData, (d) => d.value) as [number, number]
        const productScale = d3.scaleLinear()
          .domain([0, (productExtent[1] || 1) * 1.1])
          .range([height, 0])

        g.append('g')
          .attr('transform', `translate(${width},0)`)
          .call(d3.axisRight(productScale).ticks(6))
          .selectAll('text').attr('fill', '#16a34a')

        g.append('text')
          .attr('transform', 'rotate(90)')
          .attr('x', height / 2).attr('y', -width - 55)
          .attr('text-anchor', 'middle').attr('fill', '#16a34a')
          .text(productName || 'Product (g/L)')

        const productLine = d3.line<{ time: number; value: number }>()
          .x((d) => xScale(d.time))
          .y((d) => productScale(d.value))
          .curve(d3.curveMonotoneX)

        g.append('path')
          .datum(productData)
          .attr('fill', 'none').attr('stroke', '#16a34a').attr('stroke-width', 2.5)
          .attr('stroke-dasharray', '6,3').attr('d', productLine)

        g.selectAll('.product-point')
          .data(productData)
          .enter().append('circle')
          .attr('class', 'product-point')
          .attr('cx', (d) => xScale(d.time))
          .attr('cy', (d) => productScale(d.value))
          .attr('r', 4).attr('fill', '#16a34a')
          .attr('stroke', 'white').attr('stroke-width', 1.5)
      }
    }

    const legend = g.append('g').attr('transform', `translate(${width - 100}, -15)`)
    legend.append('line')
      .attr('x1', 0).attr('y1', 5).attr('x2', 20).attr('y2', 5)
      .attr('stroke', '#2563eb').attr('stroke-width', 2.5)
    legend.append('text')
      .attr('x', 25).attr('y', 9).attr('font-size', '11px').attr('fill', '#374151')
      .text(biomassName)

    if (productTimepoints && productValues) {
      legend.append('line')
        .attr('x1', 50).attr('y1', 5).attr('x2', 70).attr('y2', 5)
        .attr('stroke', '#16a34a').attr('stroke-width', 2.5)
        .attr('stroke-dasharray', '6,3')
      legend.append('text')
        .attr('x', 75).attr('y', 9).attr('font-size', '11px').attr('fill', '#374151')
        .text('Product')
    }
  }, [timepoints, biomassValues, productTimepoints, productValues, phases, productName, biomassName])

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Phase Detection</h3>
      <svg ref={svgRef}></svg>
      <div className="flex gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: phaseColors.lag }}></div>
          <span className="text-gray-600">Lag Phase</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: phaseColors.exponential }}></div>
          <span className="text-gray-600">Exponential Phase</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: phaseColors.stationary }}></div>
          <span className="text-gray-600">Stationary Phase</span>
        </div>
      </div>
    </div>
  )
}
