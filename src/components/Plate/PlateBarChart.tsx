'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Plate, Well } from '@/hooks/usePlateExperiment'
import { DataCategory } from '@/hooks/useDataCategories'

function conditionKey(well: Well): string {
  return well.variables
    .map(v => `${v.name}=${v.value}`)
    .sort()
    .join('|')
}

export function PlateBarChart({
  plate, dataCategories,
}: { plate: Plate; dataCategories: DataCategory[] }) {
  const [userCategoryId, setUserCategoryId] = useState<number | null>(null)
  const [groupReplicates, setGroupReplicates] = useState(true)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Fall back to the first available category when the user hasn't picked one
  // (or their previous pick is no longer in the list).
  const categoryId = useMemo(() => {
    if (userCategoryId !== null && dataCategories.some(c => c.id === userCategoryId)) {
      return userCategoryId
    }
    return dataCategories[0]?.id ?? null
  }, [userCategoryId, dataCategories])

  const bars = useMemo(() => {
    if (!categoryId) return []
    const wellsWithValue = plate.wells
      .map(w => {
        const dp = w.data_points.find(d => d.data_category === categoryId)
        return dp ? { well: w, value: dp.value } : null
      })
      .filter((x): x is { well: Well; value: number } => x !== null)

    if (!groupReplicates) {
      return wellsWithValue.map(({ well, value }) => ({
        label: `${well.row}${well.column}`,
        mean: value,
        stderr: 0,
        n: 1,
      }))
    }

    const groups = new Map<string, number[]>()
    const labels = new Map<string, string>()
    wellsWithValue.forEach(({ well, value }) => {
      const key = conditionKey(well) || `${well.row}${well.column}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(value)
      if (!labels.has(key)) {
        const strain = well.variables.find(v => v.name === 'strain')?.value
        labels.set(key, strain ?? `${well.row}${well.column}`)
      }
    })

    return Array.from(groups.entries()).map(([key, vals]) => {
      const mean = d3.mean(vals) ?? 0
      const stderr = vals.length > 1
        ? (d3.deviation(vals) ?? 0) / Math.sqrt(vals.length)
        : 0
      return { label: labels.get(key) ?? key, mean, stderr, n: vals.length }
    })
  }, [plate, categoryId, groupReplicates])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 16, right: 16, bottom: 70, left: 48 }
    const width = 720 - margin.left - margin.right
    const height = 320 - margin.top - margin.bottom

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    if (bars.length === 0) {
      g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6b7280')
        .text('No data for this measurement')
      return
    }

    const x = d3.scaleBand<string>()
      .domain(bars.map((b, i) => `${b.label}__${i}`))
      .range([0, width])
      .padding(0.2)

    const maxY = d3.max(bars, b => b.mean + b.stderr) ?? 0
    const y = d3.scaleLinear().domain([0, maxY * 1.1 || 1]).range([height, 0])

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d => String(d).split('__')[0]))
      .selectAll('text')
      .attr('transform', 'rotate(-40)')
      .style('text-anchor', 'end')

    g.append('g').call(d3.axisLeft(y))

    g.selectAll('rect.bar')
      .data(bars.map((b, i) => ({ ...b, _key: `${b.label}__${i}` })))
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', b => x(b._key)!)
      .attr('y', b => y(b.mean))
      .attr('width', x.bandwidth())
      .attr('height', b => height - y(b.mean))
      .attr('fill', '#eb5234')

    g.selectAll('line.err')
      .data(
        bars
          .map((b, i) => ({ ...b, _key: `${b.label}__${i}` }))
          .filter(b => b.stderr > 0),
      )
      .enter()
      .append('line')
      .attr('class', 'err')
      .attr('x1', b => (x(b._key) ?? 0) + x.bandwidth() / 2)
      .attr('x2', b => (x(b._key) ?? 0) + x.bandwidth() / 2)
      .attr('y1', b => y(b.mean - b.stderr))
      .attr('y2', b => y(b.mean + b.stderr))
      .attr('stroke', '#111827')
      .attr('stroke-width', 1)
  }, [bars])

  const category = dataCategories.find(c => c.id === categoryId)
  const toggleActive = 'px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium'
  const toggleInactive = 'px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50'

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="h-9 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
          value={categoryId ?? ''}
          onChange={e => setUserCategoryId(Number(e.target.value))}
        >
          {dataCategories.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.unit || '—'})</option>
          ))}
        </select>
        <button
          className={groupReplicates ? toggleActive : toggleInactive}
          onClick={() => setGroupReplicates(v => !v)}
        >
          {groupReplicates ? 'Grouping replicates' : 'Individual wells'}
        </button>
      </div>
      <svg ref={svgRef} />
      {category && <div className="text-xs text-gray-500">Y-axis: {category.name} ({category.unit})</div>}
    </div>
  )
}
