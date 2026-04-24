'use client'

import { useMemo, useState } from 'react'
import type { CohortPayload } from '@/lib/analysis/types'

type SortKey =
  | 'title' | 'mu_max' | 'doubling_time'
  | 'yps' | 'ypx' | 'productivity' | 'final_titer' | 'biomass'

export function DerivedParameters({ payload, product }: {
  payload: CohortPayload
  product: string | null
}) {
  const [sort, setSort] = useState<SortKey>('mu_max')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const rows = useMemo(() => {
    return payload.experiments.map(e => {
      const muMax = e.outcomes.mu_max
      const doubling = (muMax && muMax > 0) ? Math.log(2) / muMax : null
      const pickProduct = (d: Record<string, number | null>) =>
        product ? (d[product] ?? null) : null
      return {
        id: e.id,
        title: e.title,
        mu_max: muMax,
        doubling_time: doubling,
        biomass: e.outcomes.biomass,
        final_titer: pickProduct(e.outcomes.final_titer),
        productivity: pickProduct(e.outcomes.productivity),
        yps: pickProduct(e.outcomes.yps),
        ypx: pickProduct(e.outcomes.ypx),
      }
    })
  }, [payload, product])

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sort]
      const bv = b[sort]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      const cmp = typeof av === 'string'
        ? (av as string).localeCompare(bv as string)
        : (av as number) - (bv as number)
      return dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sort, dir])

  const fmt = (v: number | null, d = 3) => v === null ? '—' : v.toFixed(d)

  const col = (key: SortKey, label: string) => (
    <th
      onClick={() => {
        if (sort === key) setDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSort(key); setDir('desc') }
      }}
      className="text-left px-3 py-2 text-xs uppercase text-gray-500 cursor-pointer select-none"
    >
      {label}{sort === key ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {col('title', 'Experiment')}
            {col('mu_max', 'μ_max (1/h)')}
            {col('doubling_time', 'Doubling (h)')}
            {col('biomass', 'Biomass')}
            {col('final_titer', `Final ${product ?? ''}`)}
            {col('productivity', 'Prod. (g/L/h)')}
            {col('yps', 'Y_p/s')}
            {col('ypx', 'Y_p/x')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} className="border-b border-gray-100">
              <td className="px-3 py-2">{r.title}</td>
              <td className="px-3 py-2">{fmt(r.mu_max)}</td>
              <td className="px-3 py-2">{fmt(r.doubling_time, 2)}</td>
              <td className="px-3 py-2">{fmt(r.biomass, 2)}</td>
              <td className="px-3 py-2">{fmt(r.final_titer, 3)}</td>
              <td className="px-3 py-2">{fmt(r.productivity, 4)}</td>
              <td className="px-3 py-2">{fmt(r.yps, 3)}</td>
              <td className="px-3 py-2">{fmt(r.ypx, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
