'use client'

import React, { useRef, useState } from 'react'

export interface ComponentRow {
  name: string
  molecular_weight: string
  concentration: string
}

export interface ComplexComponentRow {
  name: string
  molecular_weight: string
  concentration: string
  percent_carbon: string
  percent_nitrogen: string
}

export interface CatalogEntry {
  name: string
  molecular_weight: number | null
  concentration: number | null
}

export interface ComplexCatalogEntry extends CatalogEntry {
  percent_carbon: number | null
  percent_nitrogen: number | null
}

export interface MediaComponentCatalog {
  carbon_sources: CatalogEntry[]
  nitrogen_sources: CatalogEntry[]
  complex_components: ComplexCatalogEntry[]
  additional_components: CatalogEntry[]
}

export const emptyCatalog = (): MediaComponentCatalog => ({
  carbon_sources: [],
  nitrogen_sources: [],
  complex_components: [],
  additional_components: [],
})

export const blankRow = (): ComponentRow => ({ name: '', molecular_weight: '', concentration: '' })

export const blankComplexRow = (): ComplexComponentRow => ({
  name: '',
  molecular_weight: '',
  concentration: '',
  percent_carbon: '',
  percent_nitrogen: '',
})

export const inputClass =
  'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export const rowsToPayload = (rows: ComponentRow[]) =>
  rows
    .filter((r) => r.name.trim() !== '')
    .map((r) => ({
      name: r.name.trim(),
      molecular_weight: r.molecular_weight.trim() === '' ? null : Number(r.molecular_weight),
      concentration: r.concentration.trim() === '' ? null : Number(r.concentration),
    }))

export const complexRowsToPayload = (rows: ComplexComponentRow[]) =>
  rows
    .filter((r) => r.name.trim() !== '')
    .map((r) => ({
      name: r.name.trim(),
      molecular_weight: r.molecular_weight.trim() === '' ? null : Number(r.molecular_weight),
      concentration: r.concentration.trim() === '' ? null : Number(r.concentration),
      percent_carbon: r.percent_carbon.trim() === '' ? null : Number(r.percent_carbon),
      percent_nitrogen: r.percent_nitrogen.trim() === '' ? null : Number(r.percent_nitrogen),
    }))

export const apiComponentsToRows = (entries: CatalogEntry[] | undefined): ComponentRow[] =>
  (entries ?? []).map((e) => ({
    name: e.name,
    molecular_weight: e.molecular_weight == null ? '' : String(e.molecular_weight),
    concentration: e.concentration == null ? '' : String(e.concentration),
  }))

interface ApiComplexComponent {
  name: string
  molecular_weight: number | null
  concentration: number | null
  percent_carbon: number | null
  percent_nitrogen: number | null
}

export const apiComplexComponentsToRows = (
  entries: ApiComplexComponent[] | undefined,
): ComplexComponentRow[] =>
  (entries ?? []).map((e) => ({
    name: e.name,
    molecular_weight: e.molecular_weight == null ? '' : String(e.molecular_weight),
    concentration: e.concentration == null ? '' : String(e.concentration),
    percent_carbon: e.percent_carbon == null ? '' : String(e.percent_carbon),
    percent_nitrogen: e.percent_nitrogen == null ? '' : String(e.percent_nitrogen),
  }))

interface ComponentSectionProps {
  label: string
  rows: ComponentRow[]
  onChange: (rows: ComponentRow[]) => void
  suggestions?: CatalogEntry[]
}

export function ComponentSection({ label, rows, onChange, suggestions = [] }: ComponentSectionProps) {
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const addRow = () => onChange([...rows, blankRow()])
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx))
  const updateRow = (idx: number, field: keyof ComponentRow, val: string) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)))
  }
  const pickSuggestion = (idx: number, entry: CatalogEntry) => {
    onChange(
      rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              name: entry.name,
              molecular_weight: entry.molecular_weight == null ? '' : String(entry.molecular_weight),
            }
          : r,
      ),
    )
    setFocusedIdx(null)
  }

  const handleBlur = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    blurTimeoutRef.current = setTimeout(() => setFocusedIdx(null), 150)
  }
  const handleFocus = (idx: number) => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    setFocusedIdx(idx)
  }

  const filteredSuggestions = (idx: number, query: string): CatalogEntry[] => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const alreadyUsed = new Set(
      rows
        .map((r, i) => (i === idx ? null : r.name.trim().toLowerCase()))
        .filter((v): v is string => !!v),
    )
    const seen = new Set<string>()
    const deduped: CatalogEntry[] = []
    for (const s of suggestions) {
      const key = s.name.toLowerCase()
      if (seen.has(key)) continue
      if (alreadyUsed.has(key)) continue
      if (key === q) continue
      if (!key.includes(q)) continue
      seen.add(key)
      deduped.push(s)
      if (deduped.length >= 8) break
    }
    return deduped
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        <button
          type="button"
          onClick={addRow}
          className="text-xs font-medium"
          style={{ color: '#eb5234' }}
        >
          + Add {label.replace(/s$/, '')}
        </button>
      </div>

      {rows.map((row, idx) => {
        const matches = filteredSuggestions(idx, row.name)
        const showDropdown = focusedIdx === idx && matches.length > 0
        return (
          <div key={idx} className="flex items-center gap-2 mb-1.5">
            <div className="flex-[2] relative">
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(idx, 'name', e.target.value)}
                onFocus={() => handleFocus(idx)}
                onBlur={handleBlur}
                placeholder="Name"
                className={inputClass}
                autoComplete="off"
              />
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-[60] max-h-52 overflow-y-auto">
                  {matches.map((entry) => (
                    <button
                      key={entry.name}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickSuggestion(idx, entry)
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      <span className="font-medium">{entry.name}</span>
                      {entry.molecular_weight != null && (
                        <span className="ml-2 text-xs text-gray-500">
                          {entry.molecular_weight} g/mol
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={row.molecular_weight}
                onChange={(e) => updateRow(idx, 'molecular_weight', e.target.value)}
                placeholder="MW (g/mol)"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={row.concentration}
                onChange={(e) => updateRow(idx, 'concentration', e.target.value)}
                placeholder="Conc. (%)"
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
              style={{ width: 28, height: 28 }}
              aria-label={`Remove ${label}`}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

interface ComplexComponentSectionProps {
  rows: ComplexComponentRow[]
  onChange: (rows: ComplexComponentRow[]) => void
  suggestions?: ComplexCatalogEntry[]
}

export function ComplexComponentSection({
  rows,
  onChange,
  suggestions = [],
}: ComplexComponentSectionProps) {
  const label = 'Complex Components'
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const addRow = () => onChange([...rows, blankComplexRow()])
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx))
  const updateRow = (idx: number, field: keyof ComplexComponentRow, val: string) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)))
  }
  const pickSuggestion = (idx: number, entry: ComplexCatalogEntry) => {
    onChange(
      rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              name: entry.name,
              molecular_weight: entry.molecular_weight == null ? '' : String(entry.molecular_weight),
              percent_carbon: entry.percent_carbon == null ? '' : String(entry.percent_carbon),
              percent_nitrogen: entry.percent_nitrogen == null ? '' : String(entry.percent_nitrogen),
            }
          : r,
      ),
    )
    setFocusedIdx(null)
  }

  const handleBlur = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    blurTimeoutRef.current = setTimeout(() => setFocusedIdx(null), 150)
  }
  const handleFocus = (idx: number) => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    setFocusedIdx(idx)
  }

  const filteredSuggestions = (idx: number, query: string): ComplexCatalogEntry[] => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const alreadyUsed = new Set(
      rows
        .map((r, i) => (i === idx ? null : r.name.trim().toLowerCase()))
        .filter((v): v is string => !!v),
    )
    const seen = new Set<string>()
    const deduped: ComplexCatalogEntry[] = []
    for (const s of suggestions) {
      const key = s.name.toLowerCase()
      if (seen.has(key)) continue
      if (alreadyUsed.has(key)) continue
      if (key === q) continue
      if (!key.includes(q)) continue
      seen.add(key)
      deduped.push(s)
      if (deduped.length >= 8) break
    }
    return deduped
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        <button
          type="button"
          onClick={addRow}
          className="text-xs font-medium"
          style={{ color: '#eb5234' }}
        >
          + Add Complex Component
        </button>
      </div>

      {rows.map((row, idx) => {
        const matches = filteredSuggestions(idx, row.name)
        const showDropdown = focusedIdx === idx && matches.length > 0
        return (
          <div key={idx} className="flex items-center gap-2 mb-1.5">
            <div className="flex-[2] relative">
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateRow(idx, 'name', e.target.value)}
                onFocus={() => handleFocus(idx)}
                onBlur={handleBlur}
                placeholder="Name"
                className={inputClass}
                autoComplete="off"
              />
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-[60] max-h-52 overflow-y-auto">
                  {matches.map((entry) => (
                    <button
                      key={entry.name}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickSuggestion(idx, entry)
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      <span className="font-medium">{entry.name}</span>
                      {entry.molecular_weight != null && (
                        <span className="ml-2 text-xs text-gray-500">
                          {entry.molecular_weight} g/mol
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={row.molecular_weight}
                onChange={(e) => updateRow(idx, 'molecular_weight', e.target.value)}
                placeholder="MW (g/mol)"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={row.concentration}
                onChange={(e) => updateRow(idx, 'concentration', e.target.value)}
                placeholder="Conc. (%)"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={row.percent_carbon}
                onChange={(e) => updateRow(idx, 'percent_carbon', e.target.value)}
                placeholder="% C"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <input
                type="number"
                step="any"
                value={row.percent_nitrogen}
                onChange={(e) => updateRow(idx, 'percent_nitrogen', e.target.value)}
                placeholder="% N"
                className={inputClass}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
              style={{ width: 28, height: 28 }}
              aria-label="Remove Complex Component"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

interface MediaFormFieldsProps {
  name: string
  onNameChange: (value: string) => void
  carbonSources: ComponentRow[]
  onCarbonSourcesChange: (rows: ComponentRow[]) => void
  nitrogenSources: ComponentRow[]
  onNitrogenSourcesChange: (rows: ComponentRow[]) => void
  complexComponents: ComplexComponentRow[]
  onComplexComponentsChange: (rows: ComplexComponentRow[]) => void
  additionalComponents: ComponentRow[]
  onAdditionalComponentsChange: (rows: ComponentRow[]) => void
  catalog?: MediaComponentCatalog
}

export function MediaFormFields({
  name,
  onNameChange,
  carbonSources,
  onCarbonSourcesChange,
  nitrogenSources,
  onNitrogenSourcesChange,
  complexComponents,
  onComplexComponentsChange,
  additionalComponents,
  onAdditionalComponentsChange,
  catalog,
}: MediaFormFieldsProps) {
  const cat = catalog ?? emptyCatalog()
  return (
    <div>
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">Media Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. YPD, M9 minimal"
          className={inputClass}
        />
      </div>

      <ComponentSection
        label="Carbon Sources"
        rows={carbonSources}
        onChange={onCarbonSourcesChange}
        suggestions={cat.carbon_sources}
      />
      <ComponentSection
        label="Nitrogen Sources"
        rows={nitrogenSources}
        onChange={onNitrogenSourcesChange}
        suggestions={cat.nitrogen_sources}
      />
      <ComplexComponentSection
        rows={complexComponents}
        onChange={onComplexComponentsChange}
        suggestions={cat.complex_components}
      />
      <ComponentSection
        label="Additional Components"
        rows={additionalComponents}
        onChange={onAdditionalComponentsChange}
        suggestions={cat.additional_components}
      />
    </div>
  )
}
