'use client'

import { useEffect, useRef, useState } from 'react'
import { DataCategory } from '@/hooks/useDataCategories'

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

function parsePastedBlock(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.map(l => l.split('\t'))
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
}

export function WellTableEditor({
  plateFormat, dataCategories,
  variableGrids, onVariableGridsChange,
  measurementGrids, onMeasurementGridsChange,
  variableNames, onVariableNamesChange,
  measurementIds, onMeasurementIdsChange,
}: WellTableEditorProps) {
  const wellKeys = buildWellKeys(plateFormat)
  const allowedCategories = dataCategories.filter(c => c.category !== 'process_data')

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

  function fillVariableColumn(name: string, fromIdx: number, values: string[]) {
    onVariableGridsChange(prev => {
      const next = { ...prev }
      const col = { ...(next[name] || {}) }
      for (let i = 0; i < values.length; i++) {
        const idx = fromIdx + i
        if (idx >= wellKeys.length) break
        const v = values[i]
        if (v === '') delete col[wellKeys[idx]]
        else col[wellKeys[idx]] = v
      }
      next[name] = col
      return next
    })
  }

  function fillMeasurementColumn(id: number, fromIdx: number, values: string[]) {
    onMeasurementGridsChange(prev => {
      const next = { ...prev }
      const col = { ...(next[id] || {}) }
      for (let i = 0; i < values.length; i++) {
        const idx = fromIdx + i
        if (idx >= wellKeys.length) break
        const v = values[i]
        if (v === '') delete col[wellKeys[idx]]
        else col[wellKeys[idx]] = v
      }
      next[id] = col
      return next
    })
  }

  // Smart paste: if the clipboard is a 2D (tab/newline) block or a multi-line
  // column, prevent default and fill the current column starting at the focused
  // row, consuming values row-major. Single-cell pastes fall through to the
  // browser's normal text-input paste.
  function handleVariablePaste(e: React.ClipboardEvent<HTMLInputElement>, name: string, wellIdx: number) {
    const text = e.clipboardData.getData('text')
    const rows = parsePastedBlock(text)
    if (rows.length === 0) return
    if (rows.length === 1 && rows[0].length === 1) return
    e.preventDefault()
    const flat: string[] = []
    for (const row of rows) for (const v of row) flat.push(v)
    fillVariableColumn(name, wellIdx, flat)
  }

  function handleMeasurementPaste(e: React.ClipboardEvent<HTMLInputElement>, id: number, wellIdx: number) {
    const text = e.clipboardData.getData('text')
    const rows = parsePastedBlock(text)
    if (rows.length === 0) return
    if (rows.length === 1 && rows[0].length === 1) return
    e.preventDefault()
    const flat: string[] = []
    for (const row of rows) for (const v of row) flat.push(v)
    fillMeasurementColumn(id, wellIdx, flat)
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
    onVariableNamesChange(prev => prev.filter(n => n !== name))
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

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Toolbar (lives outside the scroll container so the popover isn't clipped) */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200">
        <div className="text-xs text-gray-500 flex-1">
          {wellKeys.length} wells · {variableNames.length} variable{variableNames.length === 1 ? '' : 's'} · {measurementIds.length} measurement{measurementIds.length === 1 ? '' : 's'}
          {hasNoColumns && <span className="ml-2 text-gray-400">— click &ldquo;+ Add column&rdquo; to start</span>}
        </div>
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
            <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 w-64 space-y-2">
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
              {variableNames.map(name => (
                <th key={`v-${name}`} className="px-2 py-2 text-left border-b border-gray-200">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-900">{name}</span>
                    <button
                      type="button"
                      onClick={() => removeVariable(name)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label={`Remove variable ${name}`}
                    >×</button>
                  </div>
                </th>
              ))}
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
                {variableNames.map(name => (
                  <td key={`cv-${name}-${wk}`} className="p-0">
                    <input
                      className="w-full px-2 py-1 text-xs focus:outline-none focus:bg-[#eb5234]/5"
                      value={variableGrids[name]?.[wk] ?? ''}
                      onChange={e => setVariableCell(name, wk, e.target.value)}
                      onPaste={e => handleVariablePaste(e, name, wellIdx)}
                    />
                  </td>
                ))}
                {measurementIds.map(id => (
                  <td key={`cm-${id}-${wk}`} className="p-0">
                    <input
                      className="w-full px-2 py-1 text-xs focus:outline-none focus:bg-[#eb5234]/5"
                      value={measurementGrids[id]?.[wk] ?? ''}
                      onChange={e => setMeasurementCell(id, wk, e.target.value)}
                      onPaste={e => handleMeasurementPaste(e, id, wellIdx)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
