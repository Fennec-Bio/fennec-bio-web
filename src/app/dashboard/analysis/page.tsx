'use client'

import { Suspense, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AiReport } from '@/components/dashboard/analysis/AiReport'
import { AnovaHeatmap } from '@/components/dashboard/analysis/AnovaHeatmap'
import { BestVsWorstDiff } from '@/components/dashboard/analysis/BestVsWorstDiff'
import { CarbonBalance } from '@/components/dashboard/analysis/CarbonBalance'
import { CarbonConsumption } from '@/components/dashboard/analysis/CarbonConsumption'
import { CarbonFlux } from '@/components/dashboard/analysis/CarbonFlux'
import { CohortOverview } from '@/components/dashboard/analysis/CohortOverview'
import { KineticAnalysis } from '@/components/dashboard/analysis/kinetics/KineticAnalysis'
import { MainEffects } from '@/components/dashboard/analysis/MainEffects'
import { MediaScan } from '@/components/dashboard/analysis/MediaScan'
import { OutcomePicker } from '@/components/dashboard/analysis/OutcomePicker'
import { PCABiplot } from '@/components/dashboard/analysis/PCABiplot'
import { PercentileOverlay } from '@/components/dashboard/analysis/PercentileOverlay'
import { Regression } from '@/components/dashboard/analysis/Regression'
import { ResponseSurface } from '@/components/dashboard/analysis/ResponseSurface'
import { StrainLineage } from '@/components/dashboard/analysis/StrainLineage'
import { ThemeTabs } from '@/components/dashboard/analysis/ThemeTabs'
import { YieldSummary } from '@/components/dashboard/analysis/YieldSummary'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { useCohortPayload } from '@/hooks/useCohortPayload'
import { useProjectContext } from '@/hooks/useProjectContext'

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
  useAnalysisStatePersistence()

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <main className="flex-1 overflow-auto bg-gray-50 p-6">
        <ThemeTabs cohortSize={state.ids.length} />
        <div className="mt-6">
          {state.analysis === 'cohort-overview' && (
            <CohortOverview />
          )}
          {state.analysis !== 'cohort-overview' && state.ids.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              Pick experiments on the left to begin.
            </div>
          )}
          {state.analysis !== 'cohort-overview' && state.ids.length > 0 && loading && (
            <div className="text-sm text-gray-500">Loading cohort…</div>
          )}
          {state.analysis !== 'cohort-overview' && state.ids.length > 0 && error && (
            <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">
              {error}
            </div>
          )}
          {state.analysis !== 'cohort-overview' && payload && (
            <>
              {[
                'ai-report',
                'anova-heatmap', 'main-effects', 'regression',
                'response-surface', 'media-scan', 'pca',
                'strain-lineage', 'cohort-diff', 'carbon-flux',
              ].includes(state.analysis) && (
                <div className="mb-4">
                  <OutcomePicker availableProducts={payload.products ?? []} />
                </div>
              )}
              {state.analysis === 'kinetic-analysis' && (
                <KineticAnalysis payload={payload} />
              )}
              {state.analysis === 'ai-report' && (
                <AiReport ids={state.ids} outcome={state.outcome}
                          product={state.product} payload={payload} />
              )}
              {state.analysis === 'carbon-flux' && (
                <CarbonFlux payload={payload} product={state.product} />
              )}
              {state.analysis === 'anova-heatmap' && (
                <AnovaHeatmap ids={state.ids} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'main-effects' && (
                <MainEffects ids={state.ids} outcome={state.outcome}
                             product={state.product} payload={payload} />
              )}
              {state.analysis === 'regression' && (
                <Regression ids={state.ids} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'response-surface' && (
                <ResponseSurface payload={payload} ids={state.ids}
                                 outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'carbon-balance' && (
                <CarbonBalance payload={payload} />
              )}
              {state.analysis === 'carbon-consumption' && (
                <CarbonConsumption payload={payload} product={state.product} />
              )}
              {state.analysis === 'media-scan' && (
                <MediaScan payload={payload} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'pca' && (
                <PCABiplot payload={payload} ids={state.ids}
                           outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'percentile-overlay' && (
                <PercentileOverlay payload={payload} />
              )}
              {state.analysis === 'yield-summary' && (
                <YieldSummary payload={payload} product={state.product} />
              )}
              {state.analysis === 'strain-lineage' && (
                <StrainLineage payload={payload} product={state.product} outcome={state.outcome} />
              )}
              {state.analysis === 'cohort-diff' && (
                <BestVsWorstDiff payload={payload} product={state.product} outcome={state.outcome} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function useAnalysisStatePersistence() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { activeProject } = useProjectContext()
  const restoredRef = useRef(false)

  const storageKey = activeProject ? `analysis-state:${activeProject.id}` : null

  useEffect(() => {
    if (restoredRef.current) return
    if (!storageKey) return
    if (typeof window === 'undefined') return
    const qs = params?.toString() ?? ''
    if (qs) {
      restoredRef.current = true
      return
    }
    const saved = sessionStorage.getItem(storageKey)
    if (saved) {
      router.replace(`${pathname}?${saved}`)
    }
    restoredRef.current = true
  }, [storageKey, params, pathname, router])

  useEffect(() => {
    if (!restoredRef.current) return
    if (!storageKey) return
    if (typeof window === 'undefined') return
    sessionStorage.setItem(storageKey, params?.toString() ?? '')
  }, [params, storageKey])
}
