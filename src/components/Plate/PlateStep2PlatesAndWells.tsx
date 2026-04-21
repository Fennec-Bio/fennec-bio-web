'use client'

import React, { useEffect, useRef, useState } from 'react'
import { DataCategory } from '@/hooks/useDataCategories'
import { WellTableEditor } from '@/components/Plate/WellTableEditor'

export type PlateDraft = {
  localKey: string
  label: string
  format: '96' | '384'
  variableGrids: Record<string, Record<string, string>>
  measurementGrids: Record<number, Record<string, string>>
  variableNames: string[]
  measurementIds: number[]
}

export function PlateStep2PlatesAndWells({
  plates, onPlatesChange,
  selectedPlateKey, onSelectedPlateKeyChange,
  dataCategories,
  onBack, onNext,
}: {
  plates: PlateDraft[]
  onPlatesChange: React.Dispatch<React.SetStateAction<PlateDraft[]>>
  selectedPlateKey: string
  onSelectedPlateKeyChange: (key: string) => void
  dataCategories: DataCategory[]
  onBack: () => void
  onNext: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newFormat, setNewFormat] = useState<'96' | '384'>('96')
  const [addError, setAddError] = useState<string | null>(null)
  const addPopoverRef = useRef<HTMLDivElement>(null)

  // Close the "+ Add plate" popover on outside click. The listener is only
  // registered while the popover is open.
  useEffect(() => {
    if (!addOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (addPopoverRef.current && !addPopoverRef.current.contains(e.target as Node)) {
        setAddOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [addOpen])

  const selectedIdx = plates.findIndex(p => p.localKey === selectedPlateKey)
  const selected = selectedIdx >= 0 ? plates[selectedIdx] : null

  function addPlate() {
    setAddError(null)
    const label = newLabel.trim()
    if (!label) return
    if (plates.some(p => p.label === label)) {
      setAddError('A plate with that label already exists.')
      return
    }
    const localKey = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const draft: PlateDraft = {
      localKey,
      label,
      format: newFormat,
      variableGrids: {},
      measurementGrids: {},
      variableNames: [],
      measurementIds: [],
    }
    onPlatesChange(prev => [...prev, draft])
    onSelectedPlateKeyChange(localKey)
    setAddOpen(false)
    setNewLabel('')
    setNewFormat('96')
  }

  function removePlate(key: string) {
    if (key === selectedPlateKey) {
      const idx = plates.findIndex(p => p.localKey === key)
      const next = plates.filter(p => p.localKey !== key)
      // Prefer the plate that shifted into this slot; fall back to first
      // remaining; fall back to empty string when the list is now empty.
      const nextKey = next[idx]?.localKey ?? next[0]?.localKey ?? ''
      onSelectedPlateKeyChange(nextKey)
    }
    onPlatesChange(prev => prev.filter(p => p.localKey !== key))
  }

  // Controlled bundle for WellTableEditor: updates the selected plate's slice
  // of state inside the plates array. All four setters accept useState-style
  // updater functions because WellTableEditor uses the function form in places.
  function updateSelectedPlate<K extends keyof PlateDraft>(
    key: K,
    updater: React.SetStateAction<PlateDraft[K]>,
  ) {
    onPlatesChange(prev => prev.map(p =>
      p.localKey === selectedPlateKey
        ? { ...p, [key]: typeof updater === 'function' ? (updater as (v: PlateDraft[K]) => PlateDraft[K])(p[key]) : updater }
        : p,
    ))
  }

  return (
    <div className="space-y-3">
      {/* Horizontal plate tabs + Add plate popover */}
      <div className="flex flex-wrap items-center gap-2">
        {plates.map(p => {
          const active = p.localKey === selectedPlateKey
          return (
            <div
              key={p.localKey}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer ${
                active
                  ? 'bg-[#eb5234] text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              onClick={() => onSelectedPlateKeyChange(p.localKey)}
            >
              <span>
                {p.label}{' '}
                <span className={active ? 'opacity-80' : 'text-gray-500'}>({p.format})</span>
              </span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removePlate(p.localKey) }}
                className={`-mr-1 px-1 ${active ? 'text-white/80 hover:text-white' : 'text-gray-400 hover:text-red-600'}`}
                aria-label={`Remove ${p.label}`}
              >
                ×
              </button>
            </div>
          )
        })}

        <div ref={addPopoverRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setAddError(null)
              setAddOpen(o => !o)
            }}
            className="px-3 py-1.5 border border-dashed border-gray-300 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            + Add plate
          </button>
          {addOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] p-2 w-64 space-y-2">
              <div>
                <label htmlFor="plate-wizard-add-label" className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                <input
                  id="plate-wizard-add-label"
                  autoFocus
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addPlate() }}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
                />
              </div>
              <div>
                <label htmlFor="plate-wizard-add-format" className="block text-xs font-medium text-gray-700 mb-1">Format</label>
                <select
                  id="plate-wizard-add-format"
                  value={newFormat}
                  onChange={e => setNewFormat(e.target.value as '96' | '384')}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
                >
                  <option value="96">96-well</option>
                  <option value="384">384-well</option>
                </select>
              </div>
              {addError && <div className="rounded bg-red-50 p-1.5 text-xs text-red-600">{addError}</div>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={addPlate}
                  disabled={!newLabel.trim()}
                  className="px-3 py-1 bg-[#eb5234] text-white rounded-md text-xs font-medium hover:bg-[#d4492f] disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAddOpen(false); setNewLabel(''); setAddError(null) }}
                  className="px-3 py-1 border border-gray-200 bg-white text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full-width editor / empty state */}
      {selected ? (
        <WellTableEditor
          key={selected.localKey}
          plateFormat={selected.format}
          dataCategories={dataCategories}
          variableGrids={selected.variableGrids}
          onVariableGridsChange={v => updateSelectedPlate('variableGrids', v)}
          measurementGrids={selected.measurementGrids}
          onMeasurementGridsChange={v => updateSelectedPlate('measurementGrids', v)}
          variableNames={selected.variableNames}
          onVariableNamesChange={v => updateSelectedPlate('variableNames', v)}
          measurementIds={selected.measurementIds}
          onMeasurementIdsChange={v => updateSelectedPlate('measurementIds', v)}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Add a plate to get started.
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={plates.length === 0}
          className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50 disabled:pointer-events-none"
        >
          Next
        </button>
      </div>
    </div>
  )
}
