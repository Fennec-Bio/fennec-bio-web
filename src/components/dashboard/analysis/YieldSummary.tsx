'use client'

import { useMemo, useState } from 'react'
import type { CohortPayload } from '@/lib/analysis/types'

export function YieldSummary({ payload, product }: {
  payload: CohortPayload
  product: string | null
}) {
  const [groupBy, setGroupBy] = useState<string>('strain')

  const groupOptions = useMemo(() => {
    const variables = new Set<string>()
    for (const e of payload.experiments) {
      for (const v of e.variables) variables.add(v.name)
    }
    return ['strain', 'batch_media', 'feed_media', ...[...variables].sort()]
  }, [payload])

  const rows = useMemo(() => {
    type Bucket = { yps: number[]; ypx: number[]; prod: number[]; titer: number[] }
    const groups: Record<string, Bucket> = {}
    const groupFor = (e: CohortPayload['experiments'][number]): string => {
      if (groupBy === 'strain')      return e.strain?.name ?? '—'
      if (groupBy === 'batch_media') return e.batch_media?.name ?? '—'
      if (groupBy === 'feed_media')  return e.feed_media?.name ?? '—'
      const v = e.variables.find(x => x.name === groupBy)
      return v ? v.value : '—'
    }

    for (const e of payload.experiments) {
      const g = groupFor(e)
      if (!groups[g]) groups[g] = { yps: [], ypx: [], prod: [], titer: [] }
      const bucket = groups[g]
      const yps   = product ? e.outcomes.yps[product]          ?? null : null
      const ypx   = product ? e.outcomes.ypx[product]          ?? null : null
      const prod  = product ? e.outcomes.productivity[product] ?? null : null
      const titer = product ? e.outcomes.final_titer[product]  ?? null : null
      if (yps   != null) bucket.yps.push(yps)
      if (ypx   != null) bucket.ypx.push(ypx)
      if (prod  != null) bucket.prod.push(prod)
      if (titer != null) bucket.titer.push(titer)
    }

    const mean = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
    const sd = (xs: number[]) => {
      if (xs.length < 2) return null
      const m = mean(xs)!
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
    }

    return Object.entries(groups)
      .map(([g, v]) => ({
        group: g,
        n: Math.max(v.yps.length, v.ypx.length, v.prod.length, v.titer.length),
        yps_mean:   mean(v.yps),   yps_sd:   sd(v.yps),
        ypx_mean:   mean(v.ypx),   ypx_sd:   sd(v.ypx),
        prod_mean:  mean(v.prod),  prod_sd:  sd(v.prod),
        titer_mean: mean(v.titer), titer_sd: sd(v.titer),
      }))
      .sort((a, b) => (b.titer_mean ?? -Infinity) - (a.titer_mean ?? -Infinity))
  }, [payload, groupBy, product])

  const fmtMS = (m: number | null, s: number | null) =>
    m === null ? '—' : `${m.toFixed(3)}${s === null ? '' : ` ± ${s.toFixed(3)}`}`

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <div className="flex gap-2 items-center mb-3 text-sm">
        <span className="text-gray-500">Group by:</span>
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value)}
          className="h-8 px-2 border border-gray-200 rounded-md"
        >
          {groupOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {!product && (
          <span className="ml-3 text-xs text-amber-600">
            Pick a product-specific outcome to populate yields.
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-1 pr-3">{groupBy}</th>
              <th className="py-1 pr-3">n</th>
              <th className="py-1 pr-3">Final titer</th>
              <th className="py-1 pr-3">Productivity</th>
              <th className="py-1 pr-3">Y p/s</th>
              <th className="py-1 pr-3">Y p/x</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.group} className="border-t border-gray-100">
                <td className="py-1 pr-3">{r.group}</td>
                <td className="py-1 pr-3">{r.n}</td>
                <td className="py-1 pr-3">{fmtMS(r.titer_mean, r.titer_sd)}</td>
                <td className="py-1 pr-3">{fmtMS(r.prod_mean, r.prod_sd)}</td>
                <td className="py-1 pr-3">{fmtMS(r.yps_mean, r.yps_sd)}</td>
                <td className="py-1 pr-3">{fmtMS(r.ypx_mean, r.ypx_sd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
