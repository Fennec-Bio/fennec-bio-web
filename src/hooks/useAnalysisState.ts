'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import type { AnalysisSlug, OutcomeMetric, ThemeId } from '@/lib/analysis/types'
import { DEFAULT_ANALYSIS, DEFAULT_THEME } from '@/lib/analysis/constants'

export interface AnalysisState {
  // Filters
  strainIds: number[]
  parentStrainIds: number[]
  batchMediaIds: number[]
  feedMediaIds: number[]
  variableFilters: Array<{ name: string; values: string[] }>
  // Selection
  ids: number[]
  // Outcome
  outcome: OutcomeMetric
  product: string | null
  // Navigation
  theme: ThemeId
  analysis: AnalysisSlug
}

function parseIds(raw: string | null): number[] {
  if (!raw) return []
  return raw.split(',').map(Number).filter(Number.isFinite)
}

function serializeIds(ids: number[]): string | null {
  return ids.length ? ids.join(',') : null
}

export function useAnalysisState(): [AnalysisState, (partial: Partial<AnalysisState>) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const state = useMemo<AnalysisState>(() => ({
    strainIds:       parseIds(params?.get('strains') ?? null),
    parentStrainIds: parseIds(params?.get('parent_strains') ?? null),
    batchMediaIds:   parseIds(params?.get('batch_media') ?? null),
    feedMediaIds:    parseIds(params?.get('feed_media') ?? null),
    variableFilters: [], // populated in Task 17 when variable_filters round-trip is added
    ids:             parseIds(params?.get('ids') ?? null),
    outcome:         (params?.get('outcome') as OutcomeMetric) || 'final_titer',
    product:         params?.get('product') ?? null,
    theme:           (params?.get('theme') as ThemeId) || DEFAULT_THEME,
    analysis:        (params?.get('analysis') as AnalysisSlug) || DEFAULT_ANALYSIS,
  }), [params])

  const set = useCallback((partial: Partial<AnalysisState>) => {
    const merged = { ...state, ...partial }
    const next = new URLSearchParams()
    const maybeSet = (k: string, v: string | null) => {
      if (v && v.length) next.set(k, v)
    }
    maybeSet('strains',        serializeIds(merged.strainIds))
    maybeSet('parent_strains', serializeIds(merged.parentStrainIds))
    maybeSet('batch_media',    serializeIds(merged.batchMediaIds))
    maybeSet('feed_media',     serializeIds(merged.feedMediaIds))
    maybeSet('ids',            serializeIds(merged.ids))
    maybeSet('outcome',        merged.outcome === 'final_titer' ? null : merged.outcome)
    maybeSet('product',        merged.product)
    maybeSet('theme',          merged.theme === DEFAULT_THEME ? null : merged.theme)
    maybeSet('analysis',       merged.analysis === DEFAULT_ANALYSIS ? null : merged.analysis)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [pathname, router, state])

  return [state, set]
}
