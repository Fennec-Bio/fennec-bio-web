'use client'

import { useState } from 'react'

interface Filter { name: string; values: string[] }

export function VariableFilter({
  variablesCatalog,
  filters,
  onChange,
}: {
  variablesCatalog: Record<string, string[]>
  filters: Filter[]
  onChange: (next: Filter[]) => void
}) {
  const [openPicker, setOpenPicker] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const addFilter = (name: string) => {
    onChange([...filters, { name, values: [] }])
    setOpenPicker(name)
    setAddOpen(false)
  }
  const removeFilter = (name: string) => {
    onChange(filters.filter(f => f.name !== name))
    if (openPicker === name) setOpenPicker(null)
  }
  const toggleValue = (name: string, v: string) => {
    onChange(filters.map(f => {
      if (f.name !== name) return f
      const has = f.values.includes(v)
      return { ...f, values: has ? f.values.filter(x => x !== v) : [...f.values, v] }
    }))
  }

  const usedNames = new Set(filters.map(f => f.name))
  const availableNames = Object.keys(variablesCatalog)
    .filter(n => !usedNames.has(n))
    .sort()

  return (
    <div className="mb-2">
      {filters.map(f => (
        <div key={f.name} className="relative mb-1">
          <div className="h-9 w-full px-3 py-2 border border-gray-200 rounded-md text-sm flex items-center justify-between bg-white">
            <button
              type="button"
              onClick={() => setOpenPicker(openPicker === f.name ? null : f.name)}
              className="flex-1 text-left truncate"
              title={f.name}
            >
              <span className="font-medium text-gray-700">{f.name}:</span>{' '}
              <span className="text-gray-500">
                {f.values.length ? f.values.join(', ') : 'any'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => removeFilter(f.name)}
              aria-label={`Remove ${f.name} filter`}
              className="ml-2 text-gray-400 hover:text-red-500 text-lg leading-none"
            >
              ×
            </button>
          </div>
          {openPicker === f.name && (
            <div className="absolute z-[9999] mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
              {(variablesCatalog[f.name] ?? []).length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-400">No values</div>
              )}
              {(variablesCatalog[f.name] ?? []).map(v => (
                <div
                  key={v}
                  onClick={() => toggleValue(f.name, v)}
                  className="px-3 py-1.5 text-sm hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                >
                  <input type="checkbox" readOnly checked={f.values.includes(v)} />
                  {v}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAddOpen(v => !v)}
          className="h-8 px-3 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-gray-100"
        >
          + Variable filter
        </button>
        {addOpen && (
          <div className="absolute z-[9999] mt-1 min-w-[220px] max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
            {availableNames.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">All variables added</div>
            )}
            {availableNames.map(n => (
              <div
                key={n}
                onClick={() => addFilter(n)}
                className="px-3 py-1.5 text-sm hover:bg-gray-100 cursor-pointer"
              >
                {n}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
