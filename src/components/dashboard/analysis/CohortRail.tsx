'use client'

import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { useCandidateExperiments } from '@/hooks/useCandidateExperiments'
import { CohortFilters } from './CohortFilters'

export function CohortRail() {
  const [state, setState] = useAnalysisState()
  const { candidates, loading: loadingCandidates } = useCandidateExperiments({
    strainIds:       state.strainIds,
    parentStrainIds: state.parentStrainIds,
    batchMediaIds:   state.batchMediaIds,
    feedMediaIds:    state.feedMediaIds,
    variableFilters: state.variableFilters,
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: candidates.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  const selectedSet = useMemo(() => new Set(state.ids), [state.ids])
  const toggle = (id: number) => {
    const next = selectedSet.has(id)
      ? state.ids.filter(x => x !== id)
      : [...state.ids, id]
    setState({ ids: next })
  }
  const selectAll = () => setState({ ids: candidates.map(c => c.id) })
  const selectNone = () => setState({ ids: [] })

  return (
    <div>
      <CohortFilters layout="sidebar" />

      <div className="px-4 pb-4">
        <div className="mt-3 flex items-center justify-between">
          <h3 className="text-xs uppercase text-gray-400">
            Candidates ({candidates.length}) — {state.ids.length} selected
          </h3>
          <div className="flex gap-2 text-xs">
            <button onClick={selectAll} className="text-[#eb5234] hover:underline">All</button>
            <button onClick={selectNone} className="text-gray-500 hover:underline">None</button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="mt-2 h-[360px] overflow-y-auto border border-gray-200 rounded-md bg-white"
        >
          {loadingCandidates && (
            <div className="p-3 text-sm text-gray-400">Loading candidates…</div>
          )}
          {!loadingCandidates && candidates.length === 0 && (
            <div className="p-3 text-sm text-gray-400">No experiments match</div>
          )}
          {!loadingCandidates && candidates.length > 0 && (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(v => {
                const c = candidates[v.index]
                const checked = selectedSet.has(c.id)
                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      transform: `translateY(${v.start}px)`,
                      height: `${v.size}px`,
                    }}
                    className="px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                    onClick={() => toggle(c.id)}
                  >
                    <input type="checkbox" readOnly checked={checked} />
                    <span className="truncate flex-1">{c.title}</span>
                    <span className="text-xs text-gray-400 truncate">
                      {c.strain_name ?? '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
