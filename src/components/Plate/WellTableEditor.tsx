'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DataCategory } from '@/hooks/useDataCategories'
import type { PlateTemplate } from '@/hooks/usePlateTemplates'
import {
  filterSuggestions,
  getSuggestionsForVariable,
  type VariableSuggestionMap,
} from '@/components/Plate/variableCellSuggestions'
import {
  hasVariableColumn,
  insertVariableColumnAfterIfMissing,
  normalizeVariableColumnName,
} from '@/components/Plate/plateVariableColumns'
import {
  applyCellBlock,
  buildFillRows,
  parsePastedBlock,
  type CellAddress,
  type EditableColumn,
  type FillDragState,
} from '@/components/Plate/wellTableEditing'

const ROWS_96 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const ROWS_384 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']
const COLS_96 = Array.from({ length: 12 }, (_, i) => i + 1)
const COLS_384 = Array.from({ length: 24 }, (_, i) => i + 1)

function buildWellKeys(format: '96' | '384'): string[] {
  const rows = format === '96' ? ROWS_96 : ROWS_384
  const cols = format === '96' ? COLS_96 : COLS_384
  const keys: string[] = []
  for (const r of rows) {
    for (const c of cols) {
      keys.push(`${r}${c}`)
    }
  }
  return keys
}

export type WellTableEditorProps = {
  plateFormat: '96' | '384'
  dataCategories: DataCategory[]
  variableGrids: Record<string, Record<string, string>>
  onVariableGridsChange: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>
  measurementGrids: Record<number, Record<string, string>>
  onMeasurementGridsChange: React.Dispatch<React.SetStateAction<Record<number, Record<string, string>>>>
  variableNames: string[]
  onVariableNamesChange: React.Dispatch<React.SetStateAction<string[]>>
  measurementIds: number[]
  onMeasurementIdsChange: React.Dispatch<React.SetStateAction<number[]>>
  plateTemplates?: PlateTemplate[]
  onApplyTemplate?: (t: PlateTemplate) => void
  strainSuggestions?: string[]
  mediaSuggestions?: string[]
}

export function WellTableEditor({
  plateFormat, dataCategories,
  variableGrids, onVariableGridsChange,
  measurementGrids, onMeasurementGridsChange,
  variableNames, onVariableNamesChange,
  measurementIds, onMeasurementIdsChange,
  plateTemplates, onApplyTemplate,
  strainSuggestions, mediaSuggestions,
}: WellTableEditorProps) {
  const wellKeys = useMemo(() => buildWellKeys(plateFormat), [plateFormat])
  const allowedCategories = useMemo(
    () => dataCategories.filter(c => c.category !== 'process_data'),
    [dataCategories],
  )
  const editableColumns = useMemo<EditableColumn[]>(() => [
    ...variableNames.map(name => ({ kind: 'variable' as const, key: name })),
    ...measurementIds.flatMap(id => {
      const cat = allowedCategories.find(c => c.id === id)
      if (!cat) return []
      return [{ kind: 'measurement' as const, key: id }]
    }),
  ], [allowedCategories, measurementIds, variableNames])
  const [focusedCell, setFocusedCell] = useState<CellAddress | null>(null)
  const [fillDrag, setFillDrag] = useState<FillDragState | null>(null)
  const fillDragRef = useRef<FillDragState | null>(null)

  // "+ Add column" popover UI state (the only internal state the component owns).
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<'variable' | 'measurement'>('variable')
  const [newVarName, setNewVarName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setAddOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [addOpen])

  const [loadOpen, setLoadOpen] = useState(false)
  const loadPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loadOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (loadPopoverRef.current && !loadPopoverRef.current.contains(e.target as Node)) {
        setLoadOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [loadOpen])

  function setVariableCell(name: string, wellKey: string, value: string) {
    onVariableGridsChange(prev => {
      const next = { ...prev }
      const col = { ...(next[name] || {}) }
      if (value === '') delete col[wellKey]
      else col[wellKey] = value
      next[name] = col
      return next
    })
  }

  function setMeasurementCell(id: number, wellKey: string, value: string) {
    onMeasurementGridsChange(prev => {
      const next = { ...prev }
      const col = { ...(next[id] || {}) }
      if (value === '') delete col[wellKey]
      else col[wellKey] = value
      next[id] = col
      return next
    })
  }

  const getCellValue = useCallback((address: CellAddress): string => {
    const column = editableColumns[address.columnIndex]
    const wellKey = wellKeys[address.wellIndex]
    if (!column || !wellKey) return ''
    if (column.kind === 'variable') return variableGrids[column.key]?.[wellKey] ?? ''
    return measurementGrids[column.key]?.[wellKey] ?? ''
  }, [editableColumns, measurementGrids, variableGrids, wellKeys])

  const writeBlock = useCallback((start: CellAddress, rows: string[][]) => {
    if (start.columnIndex < 0 || start.wellIndex < 0) return
    const next = applyCellBlock(
      { variableGrids, measurementGrids },
      editableColumns,
      wellKeys,
      start,
      rows,
    )
    onVariableGridsChange(next.variableGrids)
    onMeasurementGridsChange(next.measurementGrids)
  }, [
    editableColumns,
    measurementGrids,
    onMeasurementGridsChange,
    onVariableGridsChange,
    variableGrids,
    wellKeys,
  ])

  // Smart paste: single-cell pastes fall through to normal text-input paste.
  // Multi-cell spreadsheet blocks preserve their row/column shape.
  function handleCellPaste(e: React.ClipboardEvent<HTMLInputElement>, address: CellAddress) {
    const text = e.clipboardData.getData('text')
    const rows = parsePastedBlock(text)
    if (rows.length === 0) return
    if (rows.length === 1 && rows[0].length === 1) return
    e.preventDefault()
    writeBlock(address, rows)
  }

  function addVariable() {
    setAddError(null)
    const name = newVarName.trim()
    if (!name) return
    if (variableNames.includes(name)) {
      setAddError('Variable name already exists.')
      return
    }
    const measNames = new Set(
      measurementIds
        .map(id => allowedCategories.find(c => c.id === id)?.name)
        .filter((n): n is string => !!n),
    )
    if (measNames.has(name)) {
      setAddError('Name collides with a measurement column.')
      return
    }
    onVariableNamesChange(prev => [...prev, name])
    setNewVarName('')
    setAddOpen(false)
  }

  function addMeasurement(id: number) {
    onMeasurementIdsChange(prev => [...prev, id])
    setAddOpen(false)
  }

  function removeVariable(name: string) {
    const n = name.toLowerCase()
    if (n === 'strain' || n === 'media') {
      window.alert('The Strain and Media variables cannot be removed.')
      return
    }
    onVariableNamesChange(prev => prev.filter(nm => nm !== name))
    onVariableGridsChange(prev => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  function removeMeasurement(id: number) {
    onMeasurementIdsChange(prev => prev.filter(i => i !== id))
    onMeasurementGridsChange(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const availableMeasurements = allowedCategories.filter(c => !measurementIds.includes(c.id))
  const hasNoColumns = variableNames.length === 0 && measurementIds.length === 0
  const suggestionsByVariable: VariableSuggestionMap = {
    strain: strainSuggestions,
    media: mediaSuggestions,
  }
  const hasIsolateColumn = hasVariableColumn(variableNames, 'Isolate')

  function addIsolateColumn() {
    onVariableNamesChange(prev => insertVariableColumnAfterIfMissing(prev, 'Isolate', 'Strain'))
  }

  useEffect(() => {
    fillDragRef.current = fillDrag
  }, [fillDrag])

  useEffect(() => {
    if (!fillDrag) return

    function finishFillDrag() {
      const current = fillDragRef.current
      if (current) {
        const value = getCellValue(current.source)
        const fill = buildFillRows(value, current.source.wellIndex, current.targetWellIndex)
        writeBlock(
          { columnIndex: current.source.columnIndex, wellIndex: fill.startWellIndex },
          fill.rows,
        )
      }
      fillDragRef.current = null
      setFillDrag(null)
    }

    function cancelFillDrag() {
      fillDragRef.current = null
      setFillDrag(null)
    }

    document.addEventListener('pointerup', finishFillDrag)
    document.addEventListener('pointercancel', cancelFillDrag)
    return () => {
      document.removeEventListener('pointerup', finishFillDrag)
      document.removeEventListener('pointercancel', cancelFillDrag)
    }
  }, [fillDrag, getCellValue, writeBlock])

  function isSameAddress(a: CellAddress | null, b: CellAddress): boolean {
    return Boolean(a && a.columnIndex === b.columnIndex && a.wellIndex === b.wellIndex)
  }

  function isInFillPreview(address: CellAddress): boolean {
    if (!fillDrag || fillDrag.source.columnIndex !== address.columnIndex) return false
    const min = Math.min(fillDrag.source.wellIndex, fillDrag.targetWellIndex)
    const max = Math.max(fillDrag.source.wellIndex, fillDrag.targetWellIndex)
    return address.wellIndex >= min && address.wellIndex <= max
  }

  function handleCellPointerEnter(address: CellAddress) {
    const current = fillDragRef.current
    if (!current || address.columnIndex !== current.source.columnIndex) return
    const next = { ...current, targetWellIndex: address.wellIndex }
    fillDragRef.current = next
    setFillDrag(next)
  }

  function handleFillPointerDown(e: React.PointerEvent<HTMLButtonElement>, address: CellAddress) {
    if (address.columnIndex < 0 || address.wellIndex < 0) return
    e.preventDefault()
    e.stopPropagation()
    const next = { source: address, targetWellIndex: address.wellIndex }
    fillDragRef.current = next
    setFocusedCell(address)
    setFillDrag(next)
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Toolbar (lives outside the scroll container so the popover isn't clipped) */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200">
        <div className="text-xs text-gray-500 flex-1">
          {wellKeys.length} wells · {variableNames.length} variable{variableNames.length === 1 ? '' : 's'} · {measurementIds.length} measurement{measurementIds.length === 1 ? '' : 's'}
          {hasNoColumns && <span className="ml-2 text-gray-400">— click &ldquo;+ Add column&rdquo; to start</span>}
        </div>
        {plateTemplates && onApplyTemplate && plateTemplates.length > 0 && (
          <div ref={loadPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => setLoadOpen(o => !o)}
              className="px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
            >
              Load template
            </button>
            {loadOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] p-2 w-64 space-y-2">
                <div className="text-xs uppercase text-gray-500 px-1">Plate templates</div>
                <ul className="max-h-60 overflow-y-auto space-y-0.5">
                  {plateTemplates.map(t => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => { onApplyTemplate(t); setLoadOpen(false) }}
                        className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100"
                      >
                        <div className="font-medium text-gray-900">{t.name}</div>
                        <div className="text-gray-500">
                          {t.plate_config.default_format}-well · {t.plate_config.variable_names.length} var{t.plate_config.variable_names.length !== 1 ? 's' : ''} · {t.plate_config.measurement_data_category_ids.length} meas
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLoadOpen(false)}
                    className="px-3 py-1 border border-gray-200 bg-white text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setAddError(null)
              setNewVarName('')
              setAddMode('variable')
              setAddOpen(o => !o)
            }}
            className="px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
          >
            + Add column
          </button>
          {addOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] p-2 w-64 space-y-2">
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => { setAddMode('variable'); setAddError(null) }}
                  className={`flex-1 px-2 py-1 rounded-md ${addMode === 'variable' ? 'bg-[#eb5234] text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >Variable</button>
                <button
                  type="button"
                  onClick={() => { setAddMode('measurement'); setAddError(null) }}
                  className={`flex-1 px-2 py-1 rounded-md ${addMode === 'measurement' ? 'bg-[#eb5234] text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >Measurement</button>
              </div>
              {addMode === 'variable' ? (
                <>
                  <input
                    autoFocus
                    value={newVarName}
                    onChange={e => setNewVarName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addVariable() }}
                    placeholder="Variable name (e.g. strain)"
                    className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
                  />
                  {addError && <div className="rounded bg-red-50 p-1.5 text-xs text-red-600">{addError}</div>}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={addVariable}
                      disabled={!newVarName.trim()}
                      className="px-3 py-1 bg-[#eb5234] text-white rounded-md text-xs font-medium hover:bg-[#d4492f] disabled:opacity-50"
                    >Add</button>
                    <button
                      type="button"
                      onClick={() => { setAddOpen(false); setNewVarName(''); setAddError(null) }}
                      className="px-3 py-1 border border-gray-200 bg-white text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
                    >Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  {availableMeasurements.length === 0 ? (
                    <div className="text-xs text-gray-500 p-1">No measurements available for this project.</div>
                  ) : (
                    <ul className="max-h-48 overflow-y-auto space-y-0.5">
                      {availableMeasurements.map(c => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => addMeasurement(c.id)}
                            className="w-full text-left px-2 py-1 text-xs rounded hover:bg-gray-100"
                          >
                            {c.name}{c.unit ? ` (${c.unit})` : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAddOpen(false)}
                      className="px-3 py-1 border border-gray-200 bg-white text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50"
                    >Close</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-auto max-h-[70vh]">
        <table className="border-collapse text-xs w-full">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              <th className="px-2 py-2 text-left text-gray-500 font-medium border-b border-gray-200 w-16">Well</th>
              {variableNames.map(name => {
                const normalizedName = normalizeVariableColumnName(name)

                return (
                  <th key={`v-${name}`} className="px-2 py-2 text-left border-b border-gray-200">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-gray-900">{name}</span>
                      {normalizedName === 'strain' && (
                        <button
                          type="button"
                          onClick={addIsolateColumn}
                          className={`ml-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                            hasIsolateColumn
                              ? 'border-[#eb5234]/30 bg-[#eb5234]/10 text-[#c24127]'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                          aria-label={hasIsolateColumn ? 'Isolate variable column enabled' : 'Add isolate variable column'}
                        >
                          {hasIsolateColumn ? 'Isolate' : 'No isolates'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeVariable(name)}
                        className="text-gray-400 hover:text-red-600"
                        aria-label={`Remove variable ${name}`}
                      >×</button>
                    </div>
                  </th>
                )
              })}
              {measurementIds.map(id => {
                const cat = allowedCategories.find(c => c.id === id)
                if (!cat) return null
                return (
                  <th key={`m-${id}`} className="px-2 py-2 text-left border-b border-gray-200">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-gray-900">{cat.name}{cat.unit ? ` (${cat.unit})` : ''}</span>
                      <button
                        type="button"
                        onClick={() => removeMeasurement(id)}
                        className="text-gray-400 hover:text-red-600"
                        aria-label={`Remove measurement ${cat.name}`}
                      >×</button>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {wellKeys.map((wk, wellIdx) => (
              <tr key={wk} className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-500 font-medium">{wk}</td>
                {variableNames.map(name => {
                  const address = {
                    columnIndex: editableColumns.findIndex(col => col.kind === 'variable' && col.key === name),
                    wellIndex: wellIdx,
                  }
                  return (
                    <td key={`cv-${name}-${wk}`} className="p-0">
                      <EditableCellShell
                        address={address}
                        focused={isSameAddress(focusedCell, address)}
                        preview={isInFillPreview(address)}
                        onFocusCell={setFocusedCell}
                        onPointerEnterCell={handleCellPointerEnter}
                        onFillPointerDown={handleFillPointerDown}
                      >
                        <VariableCellInput
                          wellKey={wk}
                          name={name}
                          value={variableGrids[name]?.[wk] ?? ''}
                          suggestionsByVariable={suggestionsByVariable}
                          onChange={next => setVariableCell(name, wk, next)}
                          onPaste={e => handleCellPaste(e, address)}
                        />
                      </EditableCellShell>
                    </td>
                  )
                })}
                {measurementIds.map(id => {
                  const address = {
                    columnIndex: editableColumns.findIndex(col => col.kind === 'measurement' && col.key === id),
                    wellIndex: wellIdx,
                  }
                  return (
                    <td key={`cm-${id}-${wk}`} className="p-0">
                      <EditableCellShell
                        address={address}
                        focused={isSameAddress(focusedCell, address)}
                        preview={isInFillPreview(address)}
                        onFocusCell={setFocusedCell}
                        onPointerEnterCell={handleCellPointerEnter}
                        onFillPointerDown={handleFillPointerDown}
                      >
                        <input
                          className="w-full px-2 py-1 text-xs focus:outline-none focus:bg-[#eb5234]/5"
                          value={measurementGrids[id]?.[wk] ?? ''}
                          onChange={e => setMeasurementCell(id, wk, e.target.value)}
                          onPaste={e => handleCellPaste(e, address)}
                        />
                      </EditableCellShell>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EditableCellShell({
  address,
  focused,
  preview,
  children,
  onFocusCell,
  onPointerEnterCell,
  onFillPointerDown,
}: {
  address: CellAddress
  focused: boolean
  preview: boolean
  children: React.ReactNode
  onFocusCell: (address: CellAddress) => void
  onPointerEnterCell: (address: CellAddress) => void
  onFillPointerDown: (e: React.PointerEvent<HTMLButtonElement>, address: CellAddress) => void
}) {
  return (
    <div
      data-well-table-cell="true"
      data-column-index={address.columnIndex}
      data-well-index={address.wellIndex}
      className={`relative min-w-32 ${
        preview ? 'bg-[#eb5234]/10 ring-1 ring-[#eb5234]/40' : ''
      } ${focused ? 'z-20 ring-1 ring-[#eb5234]' : ''}`}
      onFocusCapture={() => onFocusCell(address)}
      onPointerEnter={() => onPointerEnterCell(address)}
    >
      {children}
      {focused && (
        <button
          type="button"
          aria-label="Drag to fill this column"
          className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 cursor-ns-resize rounded-[2px] border border-white bg-[#eb5234] shadow"
          onPointerDown={e => onFillPointerDown(e, address)}
        />
      )}
    </div>
  )
}

function VariableCellInput({
  wellKey, name, value, suggestionsByVariable, onChange, onPaste,
}: {
  wellKey: string
  name: string
  value: string
  suggestionsByVariable: VariableSuggestionMap
  onChange: (next: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
}) {
  const suggestions = getSuggestionsForVariable(name, suggestionsByVariable)
  const typeaheadEnabled = suggestions.length > 0
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  if (!typeaheadEnabled) {
    return (
      <input
        className="w-full px-2 py-1 text-xs focus:outline-none focus:bg-[#eb5234]/5"
        value={value}
        onChange={e => onChange(e.target.value)}
        onPaste={onPaste}
      />
    )
  }

  const filtered = filterSuggestions(value, suggestions)

  return (
    <div ref={wrapperRef} className="relative">
      <input
        className="w-full px-2 py-1 text-xs focus:outline-none focus:bg-[#eb5234]/5"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        onPaste={onPaste}
        data-well-key={wellKey}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-[9999] w-64 max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <li key={s}>
              <button
                type="button"
                onClick={() => { onChange(s); setOpen(false) }}
                className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
