'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchCandidateExperiments } from '@/lib/analysis/api'
import { isCandidateResultPending } from '@/hooks/candidateLoadingState'

export interface Candidate {
  id: number
  title: string
  strain_name: string | null
  variables?: Array<{ name: string; value: string }>
}

export interface UseCandidateArgs {
  strainIds: number[]
  parentStrainIds: number[]
  batchMediaIds: number[]
  feedMediaIds: number[]
  variableFilters: Array<{ name: string; values: string[] }>
  includeVariables?: boolean
}

export function useCandidateExperiments(args: UseCandidateArgs): {
  candidates: Candidate[]
  loading: boolean
} {
  const { getToken } = useAuth()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedFiltersKey, setLoadedFiltersKey] = useState<string | null>(null)

  // Stable string key — useAnalysisState re-parses URL params into fresh
  // array references on every state change (including selection toggles),
  // so depending on the arrays directly would refetch on every click.
  const filtersKey = useMemo(
    () => [
      args.strainIds.join(','),
      args.parentStrainIds.join(','),
      args.batchMediaIds.join(','),
      args.feedMediaIds.join(','),
      args.variableFilters
        .filter(f => f.values.length)
        .map(f => `${f.name}=${[...f.values].sort().join(',')}`)
        .sort()
        .join(';'),
      args.includeVariables ? '1' : '0',
    ].join('|'),
    [args.strainIds, args.parentStrainIds, args.batchMediaIds, args.feedMediaIds, args.variableFilters, args.includeVariables],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const h = setTimeout(async () => {
      try {
        const token = await getToken()
        const body = await fetchCandidateExperiments(token, {
          strainIds: args.strainIds,
          parentStrainIds: args.parentStrainIds,
          batchMediaIds: args.batchMediaIds,
          feedMediaIds: args.feedMediaIds,
          variableFilters: args.variableFilters,
          pageSize: 5000,
          includeVariables: args.includeVariables,
        })
        if (!cancelled) {
          setCandidates(body.experiments.map(e => ({
            id: e.id,
            title: e.title,
            strain_name: e.strain ?? null,
            variables: e.variables,
          })))
          setLoadedFiltersKey(filtersKey)
        }
      } catch (err) {
        console.error('Failed to load candidates', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(h) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, filtersKey])

  return {
    candidates,
    loading: isCandidateResultPending(filtersKey, loadedFiltersKey, loading),
  }
}
