'use client'

import type { CohortPayload } from '@/lib/analysis/types'

export function PercentileOverlay({ payload }: { payload: CohortPayload }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-2">Percentile overlay</h3>
      <div className="text-sm text-gray-500">
        {payload.experiments.length} experiment(s) in cohort. Controls coming next.
      </div>
    </div>
  )
}
