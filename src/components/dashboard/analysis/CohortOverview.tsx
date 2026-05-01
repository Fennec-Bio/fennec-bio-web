'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { useCandidateExperiments, type Candidate } from '@/hooks/useCandidateExperiments'
import { CohortFilters } from './CohortFilters'
import { ExperimentRow } from './ExperimentRow'

function matchesSearch(c: Candidate, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  if (c.title.toLowerCase().includes(needle)) return true
  if (c.strain_name && c.strain_name.toLowerCase().includes(needle)) return true
  return false
}

export function CohortOverview() {
  const [state, setState] = useAnalysisState()

  const { candidates, loading } = useCandidateExperiments({
    strainIds:       state.strainIds,
    parentStrainIds: state.parentStrainIds,
    batchMediaIds:   state.batchMediaIds,
    feedMediaIds:    state.feedMediaIds,
    variableFilters: state.variableFilters,
    includeVariables: true,
  })

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => a.title.localeCompare(b.title)),
    [candidates],
  )

  const candidateIdSet = useMemo(
    () => new Set(sortedCandidates.map(c => c.id)),
    [sortedCandidates],
  )

  // Auto-drop: when filters narrow, prune state.ids to those still matching.
  // Skip during loading so an empty in-flight result doesn't wipe the cohort.
  useEffect(() => {
    if (loading) return
    if (state.ids.length === 0) return
    const nextIds = state.ids.filter(id => candidateIdSet.has(id))
    if (nextIds.length !== state.ids.length) {
      setState({ ids: nextIds })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIdSet, loading])

  const selectedSet = useMemo(() => new Set(state.ids), [state.ids])

  const cohortRows = useMemo(
    () => sortedCandidates.filter(c => selectedSet.has(c.id)),
    [sortedCandidates, selectedSet],
  )

  const activeFilterVariableNames = useMemo(
    () => state.variableFilters.filter(f => f.values.length).map(f => f.name),
    [state.variableFilters],
  )

  const [candidateSearch, setCandidateSearch] = useState('')
  const [cohortSearch, setCohortSearch] = useState('')

  const filteredCandidates = useMemo(
    () => sortedCandidates.filter(c => matchesSearch(c, candidateSearch)),
    [sortedCandidates, candidateSearch],
  )

  const filteredCohort = useMemo(
    () => cohortRows.filter(c => matchesSearch(c, cohortSearch)),
    [cohortRows, cohortSearch],
  )

  const toggle = (id: number) => {
    const next = selectedSet.has(id)
      ? state.ids.filter(x => x !== id)
      : [...state.ids, id]
    setState({ ids: next })
  }

  const selectAll = () => setState({ ids: sortedCandidates.map(c => c.id) })
  const clearAll  = () => setState({ ids: [] })

  const candidatesScrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filteredCandidates.length,
    getScrollElement: () => candidatesScrollRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-220px)]">
      <CohortFilters layout="bar" />

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
      {/* Candidates column */}
      <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase text-gray-500 font-semibold">
              Candidates ({sortedCandidates.length})
            </h3>
            <div className="flex gap-3 text-xs">
              <button onClick={selectAll} className="text-[#eb5234] hover:underline">All</button>
              <button onClick={clearAll}  className="text-gray-500 hover:underline">None</button>
            </div>
          </div>
          <input
            value={candidateSearch}
            onChange={e => setCandidateSearch(e.target.value)}
            placeholder="Search candidates…"
            className="mt-2 w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div ref={candidatesScrollRef} className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-3 text-sm text-gray-400">Loading candidates…</div>
          )}
          {!loading && filteredCandidates.length === 0 && (
            <div className="p-3 text-sm text-gray-400">
              {sortedCandidates.length === 0
                ? 'No experiments match your filters.'
                : 'No candidates match this search.'}
            </div>
          )}
          {!loading && filteredCandidates.length > 0 && (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(v => {
                const c = filteredCandidates[v.index]
                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      transform: `translateY(${v.start}px)`,
                      height: `${v.size}px`,
                    }}
                  >
                    <ExperimentRow
                      experiment={c}
                      inCohort={selectedSet.has(c.id)}
                      activeFilterVariableNames={activeFilterVariableNames}
                      variant="candidate"
                      onClick={() => toggle(c.id)}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cohort column */}
      <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase text-gray-500 font-semibold">
              Cohort ({cohortRows.length})
            </h3>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">
              Clear
            </button>
          </div>
          <input
            value={cohortSearch}
            onChange={e => setCohortSearch(e.target.value)}
            placeholder="Search cohort…"
            className="mt-2 w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {cohortRows.length === 0 && (
            <div className="p-3 text-sm text-gray-400">
              Click experiments on the left to add them to your cohort.
            </div>
          )}
          {cohortRows.length > 0 && filteredCohort.length === 0 && (
            <div className="p-3 text-sm text-gray-400">No cohort rows match this search.</div>
          )}
          {filteredCohort.map(c => (
            <ExperimentRow
              key={c.id}
              experiment={c}
              inCohort={true}
              activeFilterVariableNames={activeFilterVariableNames}
              variant="cohort"
              onClick={() => toggle(c.id)}
            />
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
