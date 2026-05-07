'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CohortPayload } from '../../../lib/analysis/types'
import {
  type CarbonAllocation,
  type CarbonConsumptionRow,
  buildCarbonConsumptionRows,
} from './carbonConsumptionLogic'

type ConversionMode = 'apparent' | 'carbon' | 'both'
type GroupMode = 'experiment' | 'strain' | 'batch_media' | 'feed_media'
type YMetric = 'productivity' | 'final_titer'
type SortKey =
  | 'title'
  | 'uptakeRate'
  | 'targetProductivity'
  | 'targetFinalTiter'
  | 'apparentConversion'
  | 'carbonConversion'
  | 'targetShare'

const allocationKeys: Array<keyof CarbonAllocation> = [
  'target',
  'otherProducts',
  'byproducts',
  'biomass',
  'unaccounted',
]

const allocationLabels: Record<keyof CarbonAllocation, string> = {
  target: 'Target',
  otherProducts: 'Other products',
  byproducts: 'Byproducts',
  biomass: 'Biomass',
  unaccounted: 'Unaccounted',
}

const allocationColors: Record<keyof CarbonAllocation, string> = {
  target: '#eb5234',
  otherProducts: '#2563eb',
  byproducts: '#16a34a',
  biomass: '#6b7280',
  unaccounted: '#d4d4d8',
}

function MassBalanceChip({
  mode,
  missing,
}: {
  mode: 'mass' | 'concentration-only'
  missing: {
    feedRateSeries: boolean
    batchVolume: boolean
    batchCarbonConcentration: boolean
    feedCarbonConcentration: boolean
  }
}) {
  if (mode === 'mass' && !missing.feedCarbonConcentration && !missing.feedRateSeries) {
    return null
  }
  const label = mode === 'concentration-only' ? 'concentration-only' : 'feed not counted'
  const tone = mode === 'concentration-only'
    ? 'bg-gray-100 text-gray-700'
    : 'bg-amber-50 text-amber-800'
  const reasons: string[] = []
  if (missing.batchVolume) reasons.push('batch volume')
  if (missing.batchCarbonConcentration) reasons.push('batch carbon concentration')
  if (missing.feedRateSeries) reasons.push('feed rate series')
  if (missing.feedCarbonConcentration) reasons.push('feed carbon concentration')
  return (
    <span
      className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}
      title={`Missing inputs: ${reasons.join(', ') || 'none'}`}
    >
      {label}
    </span>
  )
}

function median(values: Array<number | null>): number | null {
  const xs = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid]
}

function formatValue(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return value.toFixed(digits)
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function groupLabel(row: CarbonConsumptionRow, mode: GroupMode): string {
  if (mode === 'strain') return row.strain ?? 'No strain'
  if (mode === 'batch_media') return row.batchMedia ?? 'No batch media'
  if (mode === 'feed_media') return row.feedMedia ?? 'No feed media'
  return row.title
}

function targetShare(row: CarbonConsumptionRow, mode: ConversionMode): number | null {
  const allocation = mode === 'apparent'
    ? row.allocations.apparent
    : row.allocations.carbon
  const total = allocationKeys.reduce((sum, key) => sum + allocation[key], 0)
  return total > 0 ? allocation.target / total : null
}

function warningCount(rows: CarbonConsumptionRow[]): number {
  return rows.reduce((sum, row) => sum + row.warnings.length, 0)
}

function hasMetadataWarning(row: CarbonConsumptionRow): boolean {
  return row.warnings.some(warning => warning.startsWith('missing metadata:'))
}

export function CarbonConsumption({
  payload,
  product,
}: {
  payload: CohortPayload
  product: string | null
}) {
  const [targetProduct, setTargetProduct] = useState(product ?? payload.products[0] ?? '')
  const [conversionMode, setConversionMode] = useState<ConversionMode>('both')
  const [groupMode, setGroupMode] = useState<GroupMode>('strain')
  const [yMetric, setYMetric] = useState<YMetric>('productivity')
  const [sortKey, setSortKey] = useState<SortKey>('uptakeRate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (payload.products.length === 0) {
      setTargetProduct('')
      return
    }
    if (product && payload.products.includes(product)) {
      setTargetProduct(product)
      return
    }
    setTargetProduct(prev => payload.products.includes(prev) ? prev : payload.products[0])
  }, [payload.products, product])

  const rows = useMemo(
    () => buildCarbonConsumptionRows(payload, targetProduct),
    [payload, targetProduct],
  )

  const sortedRows = useMemo(() => {
    const getValue = (row: CarbonConsumptionRow): string | number | null => {
      if (sortKey === 'title') return row.title
      if (sortKey === 'targetShare') return targetShare(row, conversionMode)
      return row[sortKey]
    }
    return [...rows].sort((a, b) => {
      const av = getValue(a)
      const bv = getValue(b)
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      const cmp = typeof av === 'string'
        ? av.localeCompare(String(bv))
        : av - Number(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir, conversionMode])

  const summary = useMemo(() => {
    const validCarbonRows = rows.filter(row => row.carbonConversion !== null && !hasMetadataWarning(row))
    return {
      uptake: median(rows.map(row => row.uptakeRate)),
      apparent: median(rows.map(row => row.apparentConversion)),
      carbon: median(rows.map(row => row.carbonConversion)),
      share: median(rows.map(row => targetShare(row, conversionMode))),
      metadata: `${validCarbonRows.length}/${rows.length}`,
    }
  }, [rows, conversionMode])

  const sortBy = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(dir => dir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (payload.products.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No products are available in this cohort.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-gray-500">Target product</span>
            <select
              value={targetProduct}
              onChange={event => setTargetProduct(event.target.value)}
              className="h-9 rounded-md border border-gray-200 px-3 text-sm"
            >
              {payload.products.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-gray-500">Conversion</span>
            <select
              value={conversionMode}
              onChange={event => setConversionMode(event.target.value as ConversionMode)}
              className="h-9 rounded-md border border-gray-200 px-3 text-sm"
            >
              <option value="both">Both</option>
              <option value="apparent">Apparent</option>
              <option value="carbon">Carbon-normalized</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-gray-500">Color by</span>
            <select
              value={groupMode}
              onChange={event => setGroupMode(event.target.value as GroupMode)}
              className="h-9 rounded-md border border-gray-200 px-3 text-sm"
            >
              <option value="experiment">Experiment</option>
              <option value="strain">Strain</option>
              <option value="batch_media">Batch media</option>
              <option value="feed_media">Feed media</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-gray-500">Y axis</span>
            <select
              value={yMetric}
              onChange={event => setYMetric(event.target.value as YMetric)}
              className="h-9 rounded-md border border-gray-200 px-3 text-sm"
            >
              <option value="productivity">Productivity</option>
              <option value="final_titer">Final titer</option>
            </select>
          </label>
          {warningCount(rows) > 0 && (
            <div className="ml-auto rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {warningCount(rows)} warnings across {rows.length} experiments
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <SummaryCard label="Median uptake" value={formatValue(summary.uptake)} unit="g/L/h" />
        <SummaryCard label="Apparent conversion" value={formatValue(summary.apparent)} unit="g/g" />
        <SummaryCard label="Carbon conversion" value={formatPercent(summary.carbon)} unit="g C/g C" />
        <SummaryCard label="Target share" value={formatPercent(summary.share)} unit={conversionMode === 'apparent' ? 'mass' : 'carbon'} />
        <SummaryCard label="Metadata coverage" value={summary.metadata} unit="rows" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.15fr]">
        <ScatterChart rows={rows} groupMode={groupMode} yMetric={yMetric} />
        <AllocationChart rows={rows} mode={conversionMode === 'apparent' ? 'apparent' : 'carbon'} />
      </div>

      <ComparisonTable
        rows={sortedRows}
        sortKey={sortKey}
        sortDir={sortDir}
        conversionMode={conversionMode}
        onSort={sortBy}
      />
    </div>
  )
}

function SummaryCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="text-xs font-medium uppercase text-gray-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-gray-900">{value}</span>
        <span className="text-xs text-gray-500">{unit}</span>
      </div>
    </div>
  )
}

function ScatterChart({
  rows,
  groupMode,
  yMetric,
}: {
  rows: CarbonConsumptionRow[]
  groupMode: GroupMode
  yMetric: YMetric
}) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const points = rows
      .map(row => ({
        row,
        x: row.uptakeRate,
        y: yMetric === 'productivity' ? row.targetProductivity : row.targetFinalTiter,
        group: groupLabel(row, groupMode),
      }))
      .filter((point): point is {
        row: CarbonConsumptionRow
        x: number
        y: number
        group: string
      } => point.x !== null && point.y !== null)

    const width = ref.current.clientWidth || 720
    const height = 340
    const margin = { top: 18, right: 24, bottom: 46, left: 58 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    if (points.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6b7280')
        .attr('font-size', 13)
        .text('No experiments have both substrate uptake and target product data.')
      return
    }

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const x = d3.scaleLinear()
      .domain([0, d3.max(points, point => point.x) ?? 1])
      .nice()
      .range([0, innerW])
    const y = d3.scaleLinear()
      .domain([0, d3.max(points, point => point.y) ?? 1])
      .nice()
      .range([innerH, 0])
    const color = d3.scaleOrdinal<string, string>(d3.schemeTableau10)

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6))
    g.append('g').call(d3.axisLeft(y).ticks(6))

    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 38)
      .attr('text-anchor', 'middle')
      .attr('fill', '#4b5563')
      .attr('font-size', 12)
      .text('Substrate uptake rate (g/L/h)')
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -42)
      .attr('text-anchor', 'middle')
      .attr('fill', '#4b5563')
      .attr('font-size', 12)
      .text(yMetric === 'productivity' ? 'Target productivity (g/L/h)' : 'Final target titer (g/L)')

    g.selectAll('circle')
      .data(points)
      .enter()
      .append('circle')
      .attr('cx', point => x(point.x))
      .attr('cy', point => y(point.y))
      .attr('r', 5)
      .attr('fill', point => color(point.group))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .append('title')
      .text(point => `${point.row.title}\n${point.group}\nuptake ${point.x.toFixed(3)}\ny ${point.y.toFixed(3)}`)
  }, [rows, groupMode, yMetric])

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-medium text-gray-900">Uptake vs target product</h3>
      <svg ref={ref} className="w-full" style={{ height: 340 }} />
    </div>
  )
}

function AllocationChart({
  rows,
  mode,
}: {
  rows: CarbonConsumptionRow[]
  mode: 'apparent' | 'carbon'
}) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()

    const data = rows.map(row => ({
      row,
      allocation: mode === 'apparent' ? row.allocations.apparent : row.allocations.carbon,
    }))
    const width = ref.current.clientWidth || 760
    const rowH = 30
    const height = Math.max(240, data.length * rowH + 56)
    const margin = { top: 16, right: 24, bottom: 36, left: 150 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    if (data.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6b7280')
        .attr('font-size', 13)
        .text('No experiments selected.')
      return
    }

    const maxTotal = d3.max(data, item =>
      allocationKeys.reduce((sum, key) => sum + item.allocation[key], 0),
    ) ?? 1
    const x = d3.scaleLinear().domain([0, maxTotal]).nice().range([0, innerW])
    const y = d3.scaleBand()
      .domain(data.map(item => item.row.title))
      .range([0, innerH])
      .padding(0.18)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(5))
    g.append('g').call(d3.axisLeft(y))

    for (const item of data) {
      let cursor = 0
      for (const key of allocationKeys) {
        const value = item.allocation[key]
        if (value <= 0) continue
        g.append('rect')
          .attr('x', x(cursor))
          .attr('y', y(item.row.title) ?? 0)
          .attr('width', Math.max(0, x(cursor + value) - x(cursor)))
          .attr('height', y.bandwidth())
          .attr('fill', allocationColors[key])
          .append('title')
          .text(`${item.row.title}\n${allocationLabels[key]}: ${value.toFixed(3)}`)
        cursor += value
      }
    }
  }, [rows, mode])

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium text-gray-900">
          {mode === 'apparent' ? 'Apparent mass allocation' : 'Carbon allocation'}
        </h3>
        <div className="ml-auto flex flex-wrap gap-2 text-xs text-gray-500">
          {allocationKeys.map(key => (
            <span key={key} className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: allocationColors[key] }}
              />
              {allocationLabels[key]}
            </span>
          ))}
        </div>
      </div>
      <svg ref={ref} className="w-full" />
    </div>
  )
}

function ComparisonTable({
  rows,
  sortKey,
  sortDir,
  conversionMode,
  onSort,
}: {
  rows: CarbonConsumptionRow[]
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  conversionMode: ConversionMode
  onSort: (key: SortKey) => void
}) {
  const sortMark = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' up' : ' down'
  }
  const header = (key: SortKey, label: string) => (
    <th
      onClick={() => onSort(key)}
      className="cursor-pointer whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 hover:bg-gray-100"
    >
      {label}{sortMark(key)}
    </th>
  )
  const formatSubstrateConsumed = (row: CarbonConsumptionRow) => {
    if (row.massBalanceMode === 'mass' && row.substrateConsumedG != null) {
      return `${row.substrateConsumedG.toFixed(2)} g`
    }
    return row.substrateConsumed != null ? `${row.substrateConsumed.toFixed(2)} g/L` : '-'
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-900">Experiment comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {header('title', 'Experiment')}
              <th
                className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase text-gray-500"
                title="Mass (g) when batch volume and media concentration are known. Falls back to concentration delta (g/L) otherwise."
              >
                Substrate consumed
              </th>
              {header('uptakeRate', 'Uptake')}
              {header('targetProductivity', 'Productivity')}
              {header('targetFinalTiter', 'Final titer')}
              {header('apparentConversion', 'Apparent')}
              {header('carbonConversion', 'Carbon')}
              {header('targetShare', 'Target share')}
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Warnings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.experimentId} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                  {row.title}
                  <MassBalanceChip mode={row.massBalanceMode} missing={row.massBalanceMissing} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                  {formatSubstrateConsumed(row)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatValue(row.uptakeRate)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatValue(row.targetProductivity)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatValue(row.targetFinalTiter)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatValue(row.apparentConversion)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatPercent(row.carbonConversion)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{formatPercent(targetShare(row, conversionMode))}</td>
                <td className="min-w-[220px] px-3 py-2 text-xs text-gray-500">
                  {row.warnings.length ? row.warnings.join('; ') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
