'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { fetchUniqueNames, type UniqueNamesResponse } from '@/lib/analysis/api'

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

  useEffect(() => {
    let cancelled = false
    getToken()
      .then(token => fetchUniqueNames(token))
      .then(body => { if (!cancelled) setUnique(body) })
      .catch(err => console.error('Failed to load unique names', err))
    return () => { cancelled = true }
  }, [getToken])

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
      {/* Candidate list, outcome picker — added in Tasks 18 and 20. */}
    </div>
  )
}
