'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import {
  fetchUniqueNames,
  type UniqueNamesResponse,
} from '@/lib/analysis/api'
import { VariableFilter } from './VariableFilter'

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

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside, enabled])
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  layout,
}: {
  label: string
  options: Array<{ id: number; name: string }>
  selected: number[]
  onChange: (ids: number[]) => void
  layout: 'sidebar' | 'bar'
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useOutsideClick(containerRef, () => setOpen(false), open)
  const display = selected.length === 0
    ? 'any'
    : selected.length === 1
      ? (options.find(o => o.id === selected[0])?.name ?? '1 selected')
      : `${selected.length} selected`
  return (
    <div ref={containerRef} className={layout === 'sidebar' ? 'relative mb-2' : 'relative'}>
      <button
        onClick={() => setOpen(v => !v)}
        className={[
          'h-9 px-3 py-2 border border-gray-200 rounded-md text-sm font-medium text-left hover:bg-gray-100 transition-all flex items-center justify-between gap-2',
          layout === 'sidebar' ? 'w-full' : 'min-w-[180px]',
        ].join(' ')}
      >
        <span>{label}: {display}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-[9999] mt-1 min-w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
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

export function CohortFilters({ layout }: { layout: 'sidebar' | 'bar' }) {
  const { getToken } = useAuth()
  const [state, setState] = useAnalysisState()
  const [unique, setUnique] = useState<UniqueNamesResponse | null>(null)
  const [setPickerOpen, setSetPickerOpen] = useState(false)
  const [sets, setSets] = useState<ExperimentSetRow[] | null>(null)
  const [loadedSetName, setLoadedSetName] = useState<string | null>(null)
  const setPickerRef = useRef<HTMLDivElement>(null)
  useOutsideClick(setPickerRef, () => setSetPickerOpen(false), setPickerOpen)

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

  if (!unique) {
    return (
      <div className={layout === 'sidebar' ? 'p-4 text-sm text-gray-500' : 'p-3 text-sm text-gray-500'}>
        Loading filters…
      </div>
    )
  }

  if (layout === 'bar') {
    return (
      <div className="flex flex-col gap-2 p-3 bg-white border border-gray-200 rounded-lg">
        <div className="flex flex-wrap items-start gap-2">
          <MultiSelectDropdown
            label="Strain"
            options={unique.strains}
            selected={state.strainIds}
            onChange={ids => setState({ strainIds: ids })}
            layout="bar"
          />
          <MultiSelectDropdown
            label="Batch media"
            options={unique.batch_media_list}
            selected={state.batchMediaIds}
            onChange={ids => setState({ batchMediaIds: ids })}
            layout="bar"
          />
          <MultiSelectDropdown
            label="Feed media"
            options={unique.feed_media_list}
            selected={state.feedMediaIds}
            onChange={ids => setState({ feedMediaIds: ids })}
            layout="bar"
          />
          <VariableFilter
            variablesCatalog={unique.variables}
            filters={state.variableFilters}
            onChange={next => setState({ variableFilters: next })}
          />
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <div ref={setPickerRef} className="relative">
            <button
              onClick={openSetPicker}
              className="h-9 px-3 py-2 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 transition-all"
            >
              Load from set…
            </button>
            {setPickerOpen && (
              <div className="absolute z-[9999] mt-1 w-64 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
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

          {loadedSetName && (
            <div className="inline-flex items-center gap-2 px-2 h-9 rounded bg-orange-50 text-[#eb5234] text-xs">
              via {loadedSetName}
              <button onClick={() => setLoadedSetName(null)} className="text-[#eb5234]">×</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Cohort</h2>
      <h3 className="text-xs uppercase text-gray-400 mb-1">Filters</h3>
      <MultiSelectDropdown
        label="Strain"
        options={unique.strains}
        selected={state.strainIds}
        onChange={ids => setState({ strainIds: ids })}
        layout="sidebar"
      />
      <MultiSelectDropdown
        label="Batch media"
        options={unique.batch_media_list}
        selected={state.batchMediaIds}
        onChange={ids => setState({ batchMediaIds: ids })}
        layout="sidebar"
      />
      <MultiSelectDropdown
        label="Feed media"
        options={unique.feed_media_list}
        selected={state.feedMediaIds}
        onChange={ids => setState({ feedMediaIds: ids })}
        layout="sidebar"
      />
      <VariableFilter
        variablesCatalog={unique.variables}
        filters={state.variableFilters}
        onChange={next => setState({ variableFilters: next })}
      />

      <div ref={setPickerRef} className="mt-3 relative">
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
    </div>
  )
}
