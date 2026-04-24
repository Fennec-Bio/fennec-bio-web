'use client'

import { Suspense } from 'react'
import { AnovaHeatmap } from '@/components/dashboard/analysis/AnovaHeatmap'
import { CohortRail } from '@/components/dashboard/analysis/CohortRail'
import { DerivedParameters } from '@/components/dashboard/analysis/DerivedParameters'
import { KineticOverlay } from '@/components/dashboard/analysis/KineticOverlay'
import { MainEffects } from '@/components/dashboard/analysis/MainEffects'
import { ThemeTabs } from '@/components/dashboard/analysis/ThemeTabs'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { useCohortPayload } from '@/hooks/useCohortPayload'

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <AnalysisPageInner />
    </Suspense>
  )
}

function AnalysisPageInner() {
  const [state] = useAnalysisState()
  const { payload, loading, error } = useCohortPayload(state.ids)

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <aside className="w-[280px] shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
        <CohortRail />
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50 p-6">
        <ThemeTabs cohortSize={state.ids.length} />
        <div className="mt-6">
          {state.ids.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              Pick experiments on the left to begin.
            </div>
          )}
          {state.ids.length > 0 && loading && (
            <div className="text-sm text-gray-500">Loading cohort…</div>
          )}
          {state.ids.length > 0 && error && (
            <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">
              {error}
            </div>
          )}
          {payload && (
            <>
              {state.analysis === 'kinetic-overlay' && <KineticOverlay payload={payload} />}
              {state.analysis === 'derived-parameters' && (
                <DerivedParameters payload={payload} product={state.product} />
              )}
              {state.analysis === 'anova-heatmap' && (
                <AnovaHeatmap ids={state.ids} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'main-effects' && (
                <MainEffects ids={state.ids} outcome={state.outcome} product={state.product} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
