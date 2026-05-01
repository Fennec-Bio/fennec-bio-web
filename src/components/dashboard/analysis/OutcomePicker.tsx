'use client'

import { useEffect } from 'react'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { OUTCOME_METRICS } from '@/lib/analysis/constants'
import type { OutcomeMetric } from '@/lib/analysis/types'

export function OutcomePicker({ availableProducts }: { availableProducts: string[] }) {
  const [state, setState] = useAnalysisState()
  const currentMetric = OUTCOME_METRICS.find(m => m.id === state.outcome)
  const productRequired = currentMetric?.productSpecific ?? false

  useEffect(() => {
    if (productRequired && !state.product && availableProducts.length > 0) {
      setState({ product: availableProducts[0] })
    }
    if (!productRequired && state.product) {
      setState({ product: null })
    }
  }, [productRequired, state.product, availableProducts, setState])

  const productMissing = productRequired && availableProducts.length === 0

  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <h3 className="text-xs uppercase text-gray-400 mb-1">Outcome</h3>
      <select
        value={state.outcome}
        onChange={e => setState({ outcome: e.target.value as OutcomeMetric })}
        className="h-9 w-full px-2 border border-gray-200 rounded-md text-sm bg-white"
      >
        {OUTCOME_METRICS.map(m => {
          const disabled = m.productSpecific && availableProducts.length === 0
          return (
            <option key={m.id} value={m.id} disabled={disabled}>
              {m.label}{disabled ? ' — no products in cohort' : ''}
            </option>
          )
        })}
      </select>
      {productRequired && !productMissing && (
        <select
          value={state.product ?? ''}
          onChange={e => setState({ product: e.target.value || null })}
          className="mt-2 h-9 w-full px-2 border border-gray-200 rounded-md text-sm bg-white"
        >
          {availableProducts.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}
      {productMissing && (
        <div className="mt-2 text-xs text-amber-600">
          No products in selected cohort; pick biomass or μ<sub>max</sub>.
        </div>
      )}
    </div>
  )
}
