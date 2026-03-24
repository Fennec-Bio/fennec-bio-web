'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import * as d3 from 'd3'
import {
  KineticParams,
  Phase,
  PhaseName,
  mean,
  standardDeviation,
  calculateGrowthRate,
  calculateProductionRate,
  calculateYield,
  detectPhases,
  calculateProductivity,
  getFinalTiter,
} from '@/lib/kinetics'

// --- Types ---

interface Product { id: number; name: string; unit: string; timepoint: string; value: number }
interface ProcessData { id: number; name: string; unit: string; time: string; value: number }

interface ExperimentDetail {
  experiment: { id: number; title: string; description: string; benchmark: string }
  products: Product[]
  secondary_products: Product[]
  process_data: ProcessData[]
  unique_names?: { products?: string[]; secondary_products?: string[]; process_data?: string[] }
}

interface TimeSeries { timepoints: number[]; values: number[] }

// --- Helpers ---

function parseTimepoint(tp: string): number {
  const match = tp.match(/(\d+(?:\.\d+)?)\s*(hr|hours?|h|min|minutes?|m|days?|d)/i)
  if (match) {
    const n = parseFloat(match[1])
    const u = match[2].toLowerCase()
    if (u.includes('min') || u === 'm') return n / 60
    if (u.includes('day') || u === 'd') return n * 24
    return n
  }
  const n = parseFloat(tp)
  return isNaN(n) ? 0 : n
}

/** Group flat Product[] into Record<name, TimeSeries> */
function groupProducts(products: Product[]): Record<string, TimeSeries> {
  const result: Record<string, TimeSeries> = {}
  for (const p of products) {
    if (!result[p.name]) result[p.name] = { timepoints: [], values: [] }
    result[p.name].timepoints.push(parseTimepoint(p.timepoint))
    result[p.name].values.push(p.value)
  }
  return result
}

/** Group flat ProcessData[] into Record<name, TimeSeries> */
function groupProcessData(data: ProcessData[]): Record<string, TimeSeries> {
  const result: Record<string, TimeSeries> = {}
  for (const d of data) {
    if (!result[d.name]) result[d.name] = { timepoints: [], values: [] }
    result[d.name].timepoints.push(parseFloat(d.time))
    result[d.name].values.push(d.value)
  }
  return result
}

const BIOMASS_PATTERNS = [
  { pattern: /dcw|dry\s*cell\s*weight/i, name: 'DCW' },
  { pattern: /biomass/i, name: 'Biomass' },
  { pattern: /od|optical\s*density/i, name: 'OD' },
  { pattern: /cell\s*(weight|mass|density)/i, name: 'Cell' },
]

function findBiomassData(processData: Record<string, TimeSeries>): { name: string; ts: TimeSeries } | null {
  for (const { pattern } of BIOMASS_PATTERNS) {
    const entry = Object.entries(processData).find(([key]) => pattern.test(key))
    if (entry) return { name: entry[0], ts: entry[1] }
  }
  return null
}

function findSubstrateData(processData: Record<string, TimeSeries>): TimeSeries | null {
  const entry = Object.entries(processData).find(([key]) =>
    /glucose|sugar|substrate/i.test(key)
  )
  return entry ? entry[1] : null
}

function computeKinetics(
  detail: ExperimentDetail,
  productName: string
): KineticParams | null {
  const processGrouped = groupProcessData(detail.process_data)
  const biomass = findBiomassData(processGrouped)
  if (!biomass) return null

  const productGrouped = groupProducts(detail.products)
  const productTs = productGrouped[productName]
  if (!productTs) return null

  const substrate = findSubstrateData(processGrouped)
  const growth = calculateGrowthRate(biomass.ts.timepoints, biomass.ts.values)
  const production = calculateProductionRate(
    productTs.timepoints, productTs.values,
    biomass.ts.timepoints, biomass.ts.values
  )

  const yps = substrate
    ? calculateYield(productTs.timepoints, productTs.values, substrate.timepoints, substrate.values)
    : null

  return {
    experimentId: detail.experiment.id,
    title: detail.experiment.title,
    muMax: growth?.muMax ?? null,
    qpMax: production?.qpMax ?? null,
    yps,
    productivity: calculateProductivity(productTs.timepoints, productTs.values),
    finalTiter: getFinalTiter(productTs.timepoints, productTs.values),
    phases: detectPhases(biomass.ts.timepoints, biomass.ts.values),
    biomassType: biomass.name,
  }
}

// --- Phase Detector Chart ---

const phaseColors: Record<PhaseName, string> = {
  lag: '#fef3c7',
  exponential: '#dbeafe',
  stationary: '#ede9fe',
}

function PhaseChart({
  biomass, product, phases, productName, biomassName,
}: {
  biomass: TimeSeries; product: TimeSeries | null; phases: Phase[]
  productName: string; biomassName: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || biomass.timepoints.length === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 30, right: 80, bottom: 50, left: 60 }
    const width = 560 - margin.left - margin.right
    const height = 320 - margin.top - margin.bottom

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const bData = biomass.timepoints
      .map((t, i) => ({ t, v: biomass.values[i] }))
      .filter(d => d.v > 0).sort((a, b) => a.t - b.t)
    if (bData.length === 0) return

    const xExt = d3.extent(bData, d => d.t) as [number, number]
    const x = d3.scaleLinear().domain(xExt).range([0, width])
    const yB = d3.scaleLinear().domain([0, d3.max(bData, d => d.v)! * 1.1]).range([height, 0])

    // Phase backgrounds
    phases.forEach(phase => {
      const x1 = x(Math.max(phase.startTime, xExt[0]))
      const x2 = x(Math.min(phase.endTime, xExt[1]))
      g.append('rect').attr('x', x1).attr('y', 0).attr('width', x2 - x1).attr('height', height)
        .attr('fill', phaseColors[phase.name]).attr('opacity', 0.6)
      g.append('text').attr('x', (x1 + x2) / 2).attr('y', 15)
        .attr('text-anchor', 'middle').attr('font-size', '11px').attr('font-weight', '500').attr('fill', '#374151')
        .text(phase.name.charAt(0).toUpperCase() + phase.name.slice(1))
    })

    // Axes
    g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(8))
    g.append('text').attr('x', width / 2).attr('y', height + 40).attr('text-anchor', 'middle').attr('fill', '#374151').text('Time (h)')
    g.append('g').call(d3.axisLeft(yB).ticks(6))
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -45)
      .attr('text-anchor', 'middle').attr('fill', '#2563eb').text(biomassName)

    // Biomass line + points
    const bLine = d3.line<{ t: number; v: number }>().x(d => x(d.t)).y(d => yB(d.v)).curve(d3.curveMonotoneX)
    g.append('path').datum(bData).attr('fill', 'none').attr('stroke', '#2563eb').attr('stroke-width', 2.5).attr('d', bLine)
    g.selectAll('.bp').data(bData).enter().append('circle')
      .attr('cx', d => x(d.t)).attr('cy', d => yB(d.v)).attr('r', 4).attr('fill', '#2563eb').attr('stroke', 'white').attr('stroke-width', 1.5)

    // Product overlay
    if (product && product.timepoints.length > 0) {
      const pData = product.timepoints
        .map((t, i) => ({ t, v: product.values[i] }))
        .filter(d => d.t >= xExt[0] && d.t <= xExt[1]).sort((a, b) => a.t - b.t)
      if (pData.length > 0) {
        const yP = d3.scaleLinear().domain([0, d3.max(pData, d => d.v)! * 1.1]).range([height, 0])
        g.append('g').attr('transform', `translate(${width},0)`).call(d3.axisRight(yP).ticks(6))
          .selectAll('text').attr('fill', '#16a34a')
        g.append('text').attr('transform', 'rotate(90)').attr('x', height / 2).attr('y', -width - 55)
          .attr('text-anchor', 'middle').attr('fill', '#16a34a').text(productName)
        const pLine = d3.line<{ t: number; v: number }>().x(d => x(d.t)).y(d => yP(d.v)).curve(d3.curveMonotoneX)
        g.append('path').datum(pData).attr('fill', 'none').attr('stroke', '#16a34a')
          .attr('stroke-width', 2.5).attr('stroke-dasharray', '6,3').attr('d', pLine)
        g.selectAll('.pp').data(pData).enter().append('circle')
          .attr('cx', d => x(d.t)).attr('cy', d => yP(d.v)).attr('r', 4).attr('fill', '#16a34a').attr('stroke', 'white').attr('stroke-width', 1.5)
      }
    }
  }, [biomass, product, phases, productName, biomassName])

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Phase Detection</h3>
      <svg ref={svgRef} />
      <div className="flex gap-4 mt-3 text-xs">
        {(['lag', 'exponential', 'stationary'] as PhaseName[]).map(p => (
          <div key={p} className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: phaseColors[p] }} />
            <span className="text-gray-600">{p.charAt(0).toUpperCase() + p.slice(1)} Phase</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Summary Cards ---

function formatMeanStd(values: number[]): string {
  if (values.length === 0) return 'N/A'
  if (values.length === 1) return values[0].toFixed(3)
  return `${mean(values).toFixed(3)} \u00B1 ${standardDeviation(values).toFixed(3)}`
}

function fmt(v: number | null, d = 3): string { return v === null ? 'N/A' : v.toFixed(d) }

function SummaryCards({ params, selectedId }: { params: KineticParams[]; selectedId: number | null }) {
  const sel = selectedId ? params.find(k => k.experimentId === selectedId) : null
  const cards = [
    { label: '\u03BC_max', value: sel ? fmt(sel.muMax) : 'N/A', agg: formatMeanStd(params.map(k => k.muMax).filter((v): v is number => v !== null)), unit: 'h\u207B\u00B9', desc: 'Maximum specific growth rate' },
    { label: 'qP_max', value: sel ? fmt(sel.qpMax) : 'N/A', agg: formatMeanStd(params.map(k => k.qpMax).filter((v): v is number => v !== null)), unit: 'g/g/h', desc: 'Maximum specific production rate' },
    { label: 'Yp/s', value: sel ? fmt(sel.yps) : 'N/A', agg: formatMeanStd(params.map(k => k.yps).filter((v): v is number => v !== null)), unit: 'g/g', desc: 'Product yield on substrate' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {cards.map(c => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-lg font-semibold text-gray-900">{c.label}</span>
            <span className="text-sm text-gray-500">{c.unit}</span>
          </div>
          <div className="text-2xl font-bold text-blue-600 mb-1">{c.value}</div>
          <div className="text-xs text-gray-500">{c.desc}</div>
          <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            All experiments (n={params.filter(k => k[c.label === '\u03BC_max' ? 'muMax' : c.label === 'qP_max' ? 'qpMax' : 'yps'] !== null).length}): {c.agg}
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Comparison Table ---

type SortField = 'title' | 'muMax' | 'qpMax' | 'yps' | 'productivity' | 'finalTiter'

function ComparisonTable({
  params, selectedId, onSelect,
}: {
  params: KineticParams[]; selectedId: number | null; onSelect: (id: number) => void
}) {
  const [sortField, setSortField] = useState<SortField>('finalTiter')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    return [...params].sort((a, b) => {
      if (sortField === 'title') {
        const cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase())
        return sortDir === 'asc' ? cmp : -cmp
      }
      const av = a[sortField], bv = b[sortField]
      if (av === null && bv === null) return 0
      if (av === null) return sortDir === 'asc' ? 1 : -1
      if (bv === null) return sortDir === 'asc' ? -1 : 1
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [params, sortField, sortDir])

  const best = useMemo(() => {
    const getBest = (f: keyof KineticParams) => {
      const vals = params.map(k => k[f]).filter((v): v is number => typeof v === 'number')
      return vals.length > 0 ? Math.max(...vals) : null
    }
    return { muMax: getBest('muMax'), qpMax: getBest('qpMax'), yps: getBest('yps'), productivity: getBest('productivity'), finalTiter: getBest('finalTiter') }
  }, [params])

  const isBest = (f: keyof typeof best, v: number | null) => v !== null && best[f] !== null && Math.abs(v - best[f]!) < 0.0001

  const columns: { field: SortField; label: string; dec?: number }[] = [
    { field: 'muMax', label: '\u03BC_max (h\u207B\u00B9)' },
    { field: 'qpMax', label: 'qP_max (g/g/h)' },
    { field: 'yps', label: 'Yp/s (g/g)' },
    { field: 'productivity', label: 'Productivity (g/L/h)' },
    { field: 'finalTiter', label: 'Final Titer (g/L)', dec: 1 },
  ]

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className={`ml-1 ${sortField === field ? 'text-blue-600' : 'text-gray-300'}`}>
      {sortField === field ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
    </span>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-900">Experiment Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => handleSort('title')}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Experiment<SortIcon field="title" />
              </th>
              {columns.map(c => (
                <th key={c.field} onClick={() => handleSort(c.field)}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  {c.label}<SortIcon field={c.field} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sorted.map(p => (
              <tr key={p.experimentId} onClick={() => onSelect(p.experimentId)}
                className={`cursor-pointer transition-colors ${selectedId === p.experimentId ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">{p.title}</td>
                {columns.map(c => {
                  const v = p[c.field] as number | null
                  return (
                    <td key={c.field} className={`px-4 py-3 whitespace-nowrap text-sm text-right ${isBest(c.field as keyof typeof best, v) ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                      {v === null ? '-' : v.toFixed(c.dec ?? 3)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <div className="px-4 py-8 text-center text-gray-500">No experiments with kinetic data available</div>
      )}
    </div>
  )
}

// --- Main Component ---

export function KineticAnalysis() {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()

  const [experimentDetails, setExperimentDetails] = useState<ExperimentDetail[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [selectedExpId, setSelectedExpId] = useState<number | null>(null)

  // Fetch all experiments then their details
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const headers = { Authorization: `Bearer ${token}` }

      // First get experiment list (all pages)
      const params = new URLSearchParams()
      if (activeProject) params.set('project_id', activeProject.id.toString())
      params.set('page', '1')

      const firstRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experimentList/?${params}`,
        { headers }
      )
      if (!firstRes.ok) throw new Error('Failed to fetch experiments')
      const firstData = await firstRes.json()
      const totalPages = firstData.experiments.total_pages
      let allExperiments = [...firstData.experiments.experiments]

      // Fetch remaining pages
      const pagePromises = []
      for (let p = 2; p <= totalPages; p++) {
        const pp = new URLSearchParams(params)
        pp.set('page', p.toString())
        pagePromises.push(
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/experimentList/?${pp}`, { headers })
            .then(r => r.json())
            .then(d => d.experiments.experiments)
        )
      }
      const pages = await Promise.all(pagePromises)
      for (const page of pages) allExperiments = allExperiments.concat(page)

      // Fetch details for each experiment (in parallel, batched)
      const batchSize = 5
      const details: ExperimentDetail[] = []
      for (let i = 0; i < allExperiments.length; i += batchSize) {
        const batch = allExperiments.slice(i, i + batchSize)
        const batchResults = await Promise.all(
          batch.map((exp: { title: string }) =>
            fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(exp.title)}/`,
              { headers }
            ).then(r => r.ok ? r.json() : null).catch(() => null)
          )
        )
        for (const d of batchResults) {
          if (d) details.push(d)
        }
      }

      setExperimentDetails(details)
    } catch (err) {
      console.error('Error fetching kinetic data:', err)
    } finally {
      setLoading(false)
    }
  }, [getToken, activeProject])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Available products across all experiments
  const products = useMemo(() => {
    const s = new Set<string>()
    experimentDetails.forEach(d => d.products.forEach(p => s.add(p.name)))
    return Array.from(s).sort()
  }, [experimentDetails])

  // Auto-select first product
  useEffect(() => {
    if (products.length > 0 && !selectedProduct) setSelectedProduct(products[0])
  }, [products, selectedProduct])

  // Calculate kinetics for all experiments
  const kineticParams = useMemo(() => {
    if (!selectedProduct) return []
    return experimentDetails
      .map(d => computeKinetics(d, selectedProduct))
      .filter((k): k is KineticParams => k !== null)
  }, [experimentDetails, selectedProduct])

  // Auto-select first experiment with data
  useEffect(() => {
    if (kineticParams.length > 0 && selectedExpId === null) {
      setSelectedExpId(kineticParams[0].experimentId)
    }
  }, [kineticParams, selectedExpId])

  // Get selected experiment data for phase chart
  const selectedData = useMemo(() => {
    if (!selectedExpId) return null
    const detail = experimentDetails.find(d => d.experiment.id === selectedExpId)
    if (!detail) return null
    const processGrouped = groupProcessData(detail.process_data)
    const biomass = findBiomassData(processGrouped)
    if (!biomass) return null
    const productGrouped = groupProducts(detail.products)
    const productTs = productGrouped[selectedProduct] ?? null
    const kinetics = kineticParams.find(k => k.experimentId === selectedExpId)
    return {
      title: detail.experiment.title,
      biomassName: biomass.name,
      biomass: biomass.ts,
      product: productTs,
      phases: kinetics?.phases ?? [],
    }
  }, [selectedExpId, experimentDetails, selectedProduct, kineticParams])

  const biomassTypes = useMemo(() => {
    const s = new Set<string>()
    kineticParams.forEach(k => { if (k.biomassType) s.add(k.biomassType) })
    return Array.from(s)
  }, [kineticParams])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#eb5234]" />
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product:</label>
          <select
            value={selectedProduct}
            onChange={e => { setSelectedProduct(e.target.value); setSelectedExpId(null) }}
            className="border border-gray-200 rounded-md px-3 py-2 min-w-[200px] text-sm"
          >
            {products.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Experiment:</label>
          <select
            value={selectedExpId ?? ''}
            onChange={e => setSelectedExpId(Number(e.target.value))}
            className="border border-gray-200 rounded-md px-3 py-2 min-w-[250px] text-sm"
            disabled={kineticParams.length === 0}
          >
            {kineticParams.map(k => <option key={k.experimentId} value={k.experimentId}>{k.title}</option>)}
          </select>
        </div>
        {biomassTypes.length > 0 && (
          <div className="flex items-end">
            <span className="text-sm text-gray-500">Using: {biomassTypes.join(', ')}</span>
          </div>
        )}
      </div>

      {kineticParams.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No kinetic data available.</p>
          <p className="text-sm mt-2">Experiments must have biomass data (DCW, OD, or similar) and product measurements.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <SummaryCards params={kineticParams} selectedId={selectedExpId} />

          {selectedData && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-medium text-gray-900">{selectedData.title}</h3>
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">{selectedData.biomassName}</span>
              </div>
              <PhaseChart
                biomass={selectedData.biomass}
                product={selectedData.product}
                phases={selectedData.phases}
                productName={selectedProduct}
                biomassName={selectedData.biomassName}
              />
            </div>
          )}

          <ComparisonTable params={kineticParams} selectedId={selectedExpId} onSelect={setSelectedExpId} />
        </div>
      )}
    </div>
  )
}

export default KineticAnalysis
