'use client'

import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchRegression, predictRegression } from '@/lib/analysis/api'
import type {
  CohortPayload,
  OutcomeMetric,
  RegressionModelType,
  RegressionResult,
} from '@/lib/analysis/types'
import { useCohortPayload } from '@/hooks/useCohortPayload'

export function Regression({ ids, outcome, product }: {
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
}) {
  const { getToken } = useAuth()
  const { payload } = useCohortPayload(ids)
  const [modelType, setModelType] = useState<RegressionModelType>('linear')
  const [variables, setVariables] = useState<string[]>([])
  const [result, setResult] = useState<RegressionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idsKey = ids.join(',')
  const varsKey = variables.join(',')

  useEffect(() => {
    if (!payload || variables.length > 0) return
    const candidates = new Set<string>()
    for (const e of payload.experiments) {
      for (const v of e.variables) {
        if (!Number.isNaN(parseFloat(v.value))) candidates.add(v.name)
      }
    }
    setVariables([...candidates].sort().slice(0, 3))
  }, [payload, variables.length])

  useEffect(() => {
    if (variables.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const token = await getToken()
        const r = await fetchRegression(token, ids, outcome, product, variables, modelType)
        if (!cancelled) setResult(r)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, outcome, product, varsKey, modelType, getToken])

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-center text-sm">
        <span className="text-gray-500">Model:</span>
        <select
          value={modelType}
          onChange={e => setModelType(e.target.value as RegressionModelType)}
          className="h-8 px-2 border border-gray-200 rounded-md"
        >
          <option value="linear">Linear</option>
          <option value="polynomial_2">Polynomial (deg 2)</option>
        </select>
        <span className="text-gray-500 ml-2">Variables:</span>
        <VariablePicker
          payload={payload}
          selected={variables}
          onChange={setVariables}
        />
      </div>

      {loading && <div className="text-sm text-gray-500">Fitting regression…</div>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">
          {error}
        </div>
      )}

      {result && !loading && !error && (
        <>
          <div className="text-sm">
            R<sup>2</sup> = <b>{result.r_squared.toFixed(3)}</b>{' '}
            · adjusted R<sup>2</sup> = {result.adjusted_r_squared.toFixed(3)}
            <span className="text-gray-500">
              {' '}· n={result.n} · dof={result.dof}
            </span>
          </div>
          <CoefTable result={result} />
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <PredictedVsObserved result={result} />
            <ResidualsPlot result={result} />
          </div>
          <PredictSidecar
            ids={ids}
            outcome={outcome}
            product={product}
            variables={variables}
            modelType={modelType}
          />
        </>
      )}
    </div>
  )
}

function VariablePicker({ payload, selected, onChange }: {
  payload: CohortPayload | null
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const all = useMemo(() => {
    if (!payload) return []
    const numeric = new Set<string>()
    for (const e of payload.experiments) {
      for (const v of e.variables) {
        if (!Number.isNaN(parseFloat(v.value))) numeric.add(v.name)
      }
    }
    return [...numeric].sort()
  }, [payload])
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="h-8 px-3 border border-gray-200 rounded-md text-sm hover:bg-gray-100"
      >
        {selected.length} selected ▾
      </button>
      {open && (
        <div className="absolute z-[9999] mt-1 min-w-[200px] max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
          {all.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No numeric variables in cohort.</div>
          )}
          {all.map(n => {
            const on = selected.includes(n)
            return (
              <div
                key={n}
                onClick={() => onChange(on ? selected.filter(x => x !== n) : [...selected, n])}
                className="px-3 py-1.5 text-sm hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              >
                <input type="checkbox" readOnly checked={on} />
                {n}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CoefTable({ result }: { result: RegressionResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="py-1 pr-3">Term</th>
            <th className="py-1 pr-3">Coef</th>
            <th className="py-1 pr-3">Stderr</th>
            <th className="py-1 pr-3">95% CI</th>
            <th className="py-1 pr-3">p</th>
          </tr>
        </thead>
        <tbody>
          {result.coefficients.map(c => (
            <tr key={c.name} className="border-t border-gray-100">
              <td className="py-1 pr-3">{c.name}</td>
              <td className="py-1 pr-3">{c.coef.toFixed(4)}</td>
              <td className="py-1 pr-3 text-gray-500">{c.stderr.toFixed(4)}</td>
              <td className="py-1 pr-3 text-gray-500">
                [{c.ci_low.toFixed(3)}, {c.ci_high.toFixed(3)}]
              </td>
              <td className="py-1 pr-3">{c.p < 1e-4 ? c.p.toExponential(1) : c.p.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PredictedVsObserved({ result }: { result: RegressionResult }) {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    if (!ref.current || result.residuals.length === 0) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth || 320
    const H = 220
    const m = { top: 10, right: 10, bottom: 34, left: 42 }
    const iw = W - m.left - m.right
    const ih = H - m.top - m.bottom
    const g = svg.attr('viewBox', `0 0 ${W} ${H}`)
      .append('g').attr('transform', `translate(${m.left},${m.top})`)
    const all = [
      ...result.residuals.map(r => r.observed),
      ...result.residuals.map(r => r.predicted),
    ]
    const domain = d3.extent(all) as [number, number]
    const x = d3.scaleLinear().domain(domain).nice().range([0, iw])
    const y = d3.scaleLinear().domain(domain).nice().range([ih, 0])
    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(4))
    g.append('g').call(d3.axisLeft(y).ticks(4))
    g.append('line')
      .attr('x1', x(x.domain()[0])).attr('x2', x(x.domain()[1]))
      .attr('y1', y(y.domain()[0])).attr('y2', y(y.domain()[1]))
      .attr('stroke', '#d1d5db').attr('stroke-dasharray', '3,3')
    g.selectAll('circle').data(result.residuals).enter().append('circle')
      .attr('cx', d => x(d.predicted))
      .attr('cy', d => y(d.observed))
      .attr('r', 3).attr('fill', '#eb5234')
    g.append('text').attr('x', iw / 2).attr('y', ih + 28)
      .attr('text-anchor', 'middle').attr('fill', '#6b7280').attr('font-size', 11)
      .text('predicted')
  }, [result])
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">Predicted vs observed</div>
      <svg ref={ref} className="w-full" style={{ height: 220 }} />
    </div>
  )
}

function ResidualsPlot({ result }: { result: RegressionResult }) {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    if (!ref.current || result.residuals.length === 0) return
    const svg = d3.select(ref.current)
    svg.selectAll('*').remove()
    const W = ref.current.clientWidth || 320
    const H = 220
    const m = { top: 10, right: 10, bottom: 34, left: 42 }
    const iw = W - m.left - m.right
    const ih = H - m.top - m.bottom
    const g = svg.attr('viewBox', `0 0 ${W} ${H}`)
      .append('g').attr('transform', `translate(${m.left},${m.top})`)
    const x = d3.scaleLinear()
      .domain(d3.extent(result.residuals, r => r.predicted) as [number, number])
      .nice().range([0, iw])
    const y = d3.scaleLinear()
      .domain(d3.extent(result.residuals, r => r.residual) as [number, number])
      .nice().range([ih, 0])
    g.append('g').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(4))
    g.append('g').call(d3.axisLeft(y).ticks(4))
    g.append('line').attr('x1', 0).attr('x2', iw)
      .attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', '#9ca3af')
    g.selectAll('circle').data(result.residuals).enter().append('circle')
      .attr('cx', d => x(d.predicted))
      .attr('cy', d => y(d.residual))
      .attr('r', 3).attr('fill', '#1d4ed8')
    g.append('text').attr('x', iw / 2).attr('y', ih + 28)
      .attr('text-anchor', 'middle').attr('fill', '#6b7280').attr('font-size', 11)
      .text('predicted')
  }, [result])
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">Residuals</div>
      <svg ref={ref} className="w-full" style={{ height: 220 }} />
    </div>
  )
}

function PredictSidecar({
  ids, outcome, product, variables, modelType,
}: {
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
  variables: string[]
  modelType: RegressionModelType
}) {
  const { getToken } = useAuth()
  const [at, setAt] = useState<Record<string, string>>({})
  const [pred, setPred] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setAt(prev => {
      const next: Record<string, string> = {}
      for (const v of variables) next[v] = prev[v] ?? ''
      return next
    })
    setPred(null)
  }, [variables])

  const run = async () => {
    try {
      setErr(null)
      setBusy(true)
      const atNum: Record<string, number> = {}
      for (const v of variables) {
        const n = parseFloat(at[v] ?? '')
        if (Number.isNaN(n)) throw new Error(`Enter a number for ${v}`)
        atNum[v] = n
      }
      const token = await getToken()
      const r = await predictRegression(
        token, ids, outcome, product, variables, modelType, atNum,
      )
      setPred(r.prediction)
    } catch (e) {
      setErr(String(e))
      setPred(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-gray-200 pt-4">
      <h4 className="text-sm font-medium text-gray-900 mb-2">Predict</h4>
      <div className="flex gap-3 flex-wrap items-end">
        {variables.map(v => (
          <label key={v} className="flex flex-col text-xs text-gray-500">
            {v}
            <input
              type="number"
              step="any"
              value={at[v] ?? ''}
              onChange={e => setAt(prev => ({ ...prev, [v]: e.target.value }))}
              className="h-8 w-28 px-2 border border-gray-200 rounded-md text-sm mt-1"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="h-8 px-4 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
        >
          {busy ? 'Predicting…' : 'Predict'}
        </button>
      </div>
      {pred !== null && (
        <div className="mt-2 text-sm">
          Predicted outcome: <b>{pred.toFixed(3)}</b>
        </div>
      )}
      {err && <div className="mt-2 text-sm text-red-700">{err}</div>}
    </div>
  )
}
