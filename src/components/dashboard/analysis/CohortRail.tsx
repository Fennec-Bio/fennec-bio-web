'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import {
  fetchCandidateExperiments,
  fetchUniqueNames,
  type UniqueNamesResponse,
} from '@/lib/analysis/api'

interface Candidate {
  id: number
  title: string
  strain_name: string | null
}

interface ExperimentSetRow {
  id: string
  name: string
  experiment_ids: number[]
}

async function fetchExperimentSets(token: string | null): Promise<ExperimentSetRow[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/experiment-sets/`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  )
  if (!res.ok) return []
  const body = await res.json()
  const raw: Array<{
    id: string
    name: string
    experiments?: Array<{ id: number }>
  }> = Array.isArray(body) ? body : (body.results ?? body.experiment_sets ?? [])
  return raw.map(r => ({
    id: r.id,
    name: r.name,
    experiment_ids: (r.experiments ?? []).map(e => e.id),
  }))
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: Array<{ id: number; name: string }>
  selected: number[]
  onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const display = selected.length === 0
    ? 'any'
    : selected.length === 1
      ? (options.find(o => o.id === selected[0])?.name ?? '1 selected')
      : `${selected.length} selected`
  return (
    <div className="relative mb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="h-9 w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-medium text-left hover:bg-gray-100 transition-all flex items-center justify-between"
      >
        <span>{label}: {display}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-[9999] mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No options</div>
          )}
          {options.map(opt => {
            const checked = selected.includes(opt.id)
            return (
              <div
                key={opt.id}
                onClick={() => onChange(
                  checked ? selected.filter(s => s !== opt.id) : [...selected, opt.id],
                )}
                className="px-3 py-2 hover:bg-gray-100 text-sm cursor-pointer flex items-center gap-2"
              >
                <input type="checkbox" readOnly checked={checked} />
                {opt.name}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CohortRail() {
  const { getToken } = useAuth()
  const [state, setState] = useAnalysisState()
  const [unique, setUnique] = useState<UniqueNamesResponse | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [setPickerOpen, setSetPickerOpen] = useState(false)
  const [sets, setSets] = useState<ExperimentSetRow[] | null>(null)
  const [loadedSetName, setLoadedSetName] = useState<string | null>(null)

  const openSetPicker = async () => {
    setSetPickerOpen(true)
    if (sets === null) {
      const token = await getToken()
      const fetched = await fetchExperimentSets(token)
      setSets(fetched)
    }
  }

  const loadFromSet = (s: ExperimentSetRow) => {
    setState({ ids: s.experiment_ids })
    setLoadedSetName(s.name)
    setSetPickerOpen(false)
  }

  useEffect(() => {
    let cancelled = false
    getToken()
      .then(token => fetchUniqueNames(token))
      .then(body => { if (!cancelled) setUnique(body) })
      .catch(err => console.error('Failed to load unique names', err))
    return () => { cancelled = true }
  }, [getToken])

  useEffect(() => {
    let cancelled = false
    setLoadingCandidates(true)
    const h = setTimeout(async () => {
      try {
        const token = await getToken()
        const body = await fetchCandidateExperiments(token, {
          strainIds: state.strainIds,
          parentStrainIds: state.parentStrainIds,
          batchMediaIds: state.batchMediaIds,
          feedMediaIds: state.feedMediaIds,
        })
        if (!cancelled) {
          setCandidates(body.experiments.map(e => ({
            id: e.id,
            title: e.title,
            // ExperimentSerializer returns strain as a bare string (or null).
            strain_name: ((e as unknown) as { strain?: string | null }).strain ?? null,
          })))
        }
      } catch (err) {
        console.error('Failed to load candidates', err)
      } finally {
        if (!cancelled) setLoadingCandidates(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(h) }
  }, [getToken, state.strainIds, state.parentStrainIds, state.batchMediaIds, state.feedMediaIds])

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

  if (!unique) return <div className="p-4 text-sm text-gray-500">Loading filters…</div>

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Cohort</h2>
      <h3 className="text-xs uppercase text-gray-400 mb-1">Filters</h3>
      <MultiSelectDropdown
        label="Strain"
        options={unique.strains}
        selected={state.strainIds}
        onChange={ids => setState({ strainIds: ids })}
      />
      <MultiSelectDropdown
        label="Parent strain"
        options={unique.parent_strains}
        selected={state.parentStrainIds}
        onChange={ids => setState({ parentStrainIds: ids })}
      />
      <MultiSelectDropdown
        label="Batch media"
        options={unique.batch_media_list}
        selected={state.batchMediaIds}
        onChange={ids => setState({ batchMediaIds: ids })}
      />
      <MultiSelectDropdown
        label="Feed media"
        options={unique.feed_media_list}
        selected={state.feedMediaIds}
        onChange={ids => setState({ feedMediaIds: ids })}
      />

      <div className="mt-3 relative">
        <button
          onClick={openSetPicker}
          className="h-9 w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 transition-all text-left"
        >
          Load from set…
        </button>
        {loadedSetName && (
          <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 rounded bg-orange-50 text-[#eb5234] text-xs">
            via {loadedSetName}
            <button onClick={() => setLoadedSetName(null)} className="text-[#eb5234]">×</button>
          </div>
        )}
        {setPickerOpen && (
          <div className="absolute z-[9999] mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {sets === null && <div className="px-3 py-2 text-sm text-gray-400">Loading…</div>}
            {sets?.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No sets</div>}
            {sets?.map(s => (
              <div
                key={s.id}
                onClick={() => loadFromSet(s)}
                className="px-3 py-2 hover:bg-gray-100 text-sm cursor-pointer"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-gray-400">
                  {s.experiment_ids.length} experiments
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
      {/* Load-from-set popover (Task 19), outcome picker (Task 20). */}
    </div>
  )
}
