'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import * as XLSX from 'xlsx'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

interface Product {
  id: number
  name: string
  unit: string
  timepoint: string
  value: number
}

interface ExperimentDetail {
  experiment: Experiment
  products: Product[]
  secondary_products: Product[]
  process_data: Product[]
  variables: { id: number; name: string; value: string }[]
  events: { id: number; name: string; timepoint: string; value: number }[]
  anomalies: { id: number; name: string; timepoint: string; description?: string }[]
}

interface EditExperimentProps {
  selectedExperiment: Experiment | null
}

type Tab = 'primary-products' | 'secondary-products' | 'process-data' | 'variables' | 'experiment-notes'

const TABS: { key: Tab; label: string }[] = [
  { key: 'primary-products', label: 'Primary Products' },
  { key: 'secondary-products', label: 'Secondary Products' },
  { key: 'process-data', label: 'Process Data' },
  { key: 'variables', label: 'Variables' },
  { key: 'experiment-notes', label: 'Experiment Notes' },
]

function parseTimepoint(tp: string): number {
  const n = parseFloat(tp)
  return isNaN(n) ? 0 : n
}

interface GridData {
  names: string[]
  rows: { timepoint: string; values: string[] }[]
}

// col -1 = timepoint column, 0+ = value columns
interface CellPos { row: number; col: number }

function buildSpreadsheet(products: Product[]): GridData {
  const names = [...new Set(products.map(p => p.name))].sort()
  const timepointSet = new Map<string, number>()
  products.forEach(p => {
    if (!timepointSet.has(p.timepoint)) {
      timepointSet.set(p.timepoint, parseTimepoint(p.timepoint))
    }
  })
  const timepoints = [...timepointSet.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0])

  const lookup = new Map<string, number>()
  products.forEach(p => {
    lookup.set(`${p.timepoint}|${p.name}`, p.value)
  })

  const rows = timepoints.map(tp => {
    const values = names.map(name => {
      const val = lookup.get(`${tp}|${name}`)
      return val !== undefined ? val.toFixed(2) : ''
    })
    return { timepoint: tp, values }
  })

  return { names, rows }
}

function getSelectionBounds(a: CellPos, b: CellPos) {
  return {
    minRow: Math.min(a.row, b.row),
    maxRow: Math.max(a.row, b.row),
    minCol: Math.min(a.col, b.col),
    maxCol: Math.max(a.col, b.col),
  }
}

function getCellValue(grid: GridData, row: number, col: number): string {
  if (col === -1) return grid.rows[row]?.timepoint ?? ''
  return grid.rows[row]?.values[col] ?? ''
}

export function EditExperiment({ selectedExperiment }: EditExperimentProps) {
  const { getToken } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('primary-products')
  const [data, setData] = useState<ExperimentDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const [primaryEdits, setPrimaryEdits] = useState<GridData | null>(null)
  const [secondaryEdits, setSecondaryEdits] = useState<GridData | null>(null)
  const [processEdits, setProcessEdits] = useState<GridData | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add column modal
  const [showAddColumnModal, setShowAddColumnModal] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')

  // Selection state
  const [selAnchor, setSelAnchor] = useState<CellPos | null>(null)
  const [selEnd, setSelEnd] = useState<CellPos | null>(null)
  const [editingCell, setEditingCell] = useState<CellPos | null>(null)
  const isDragging = useRef(false)
  const tableRef = useRef<HTMLDivElement>(null)

  const selectedTitle = selectedExperiment?.title ?? null

  useEffect(() => {
    if (!selectedTitle) {
      setData(null)
      setPrimaryEdits(null)
      setSecondaryEdits(null)
      setProcessEdits(null)
      setHasChanges(false)
      setSelAnchor(null)
      setSelEnd(null)
      setEditingCell(null)
      return
    }
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      setSelAnchor(null)
      setSelEnd(null)
      setEditingCell(null)
      try {
        const token = await getToken()
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(selectedTitle)}/`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok && !cancelled) {
          const detail: ExperimentDetail = await res.json()
          setData(detail)
          setPrimaryEdits(buildSpreadsheet(detail.products))
          setSecondaryEdits(buildSpreadsheet(detail.secondary_products))
          setProcessEdits(buildSpreadsheet(detail.process_data))
          setHasChanges(false)
        }
      } catch (err) {
        console.error('Error fetching experiment:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selectedTitle, getToken])

  // Clear selection when switching tabs
  useEffect(() => {
    setSelAnchor(null)
    setSelEnd(null)
    setEditingCell(null)
  }, [activeTab])

  const getActiveGrid = useCallback((): [GridData | null, React.Dispatch<React.SetStateAction<GridData | null>>] => {
    if (activeTab === 'primary-products') return [primaryEdits, setPrimaryEdits]
    if (activeTab === 'secondary-products') return [secondaryEdits, setSecondaryEdits]
    if (activeTab === 'process-data') return [processEdits, setProcessEdits]
    return [null, () => {}]
  }, [activeTab, primaryEdits, secondaryEdits, processEdits])

  const updateCell = useCallback((
    setter: React.Dispatch<React.SetStateAction<GridData | null>>,
    row: number, col: number, value: string
  ) => {
    setter(prev => {
      if (!prev) return prev
      const newRows = prev.rows.map((r, i) => {
        if (i !== row) return r
        if (col === -1) return { ...r, timepoint: value }
        const newValues = [...r.values]
        newValues[col] = value
        return { ...r, values: newValues }
      })
      return { ...prev, rows: newRows }
    })
    setHasChanges(true)
  }, [])

  const isSelected = useCallback((row: number, col: number) => {
    if (!selAnchor || !selEnd) return false
    const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selAnchor, selEnd)
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
  }, [selAnchor, selEnd])

  const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.detail === 2) {
      // Double click — enter edit mode
      setEditingCell({ row, col })
      setSelAnchor({ row, col })
      setSelEnd({ row, col })
      return
    }
    // Single click — select cell (start drag)
    setEditingCell(null)
    if (e.shiftKey && selAnchor) {
      setSelEnd({ row, col })
    } else {
      setSelAnchor({ row, col })
      setSelEnd({ row, col })
    }
    isDragging.current = true
  }, [selAnchor])

  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (isDragging.current) {
      setSelEnd({ row, col })
    }
  }, [])

  // Global mouseup to stop dragging
  useEffect(() => {
    const handleUp = () => { isDragging.current = false }
    window.addEventListener('mouseup', handleUp)
    return () => window.removeEventListener('mouseup', handleUp)
  }, [])

  // Keyboard navigation and type-to-edit on the table
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editingCell) return // let the input handle keys when editing
    if (!selAnchor) return

    const [grid, setter] = getActiveGrid()
    if (!grid) return

    const { row, col } = selAnchor
    const maxCol = grid.names.length - 1

    // Arrow keys move selection
    if (e.key === 'ArrowDown' && row < grid.rows.length - 1) {
      e.preventDefault()
      const next = { row: row + 1, col }
      setSelAnchor(next); setSelEnd(next)
    } else if (e.key === 'ArrowUp' && row > 0) {
      e.preventDefault()
      const next = { row: row - 1, col }
      setSelAnchor(next); setSelEnd(next)
    } else if (e.key === 'ArrowRight' && col < maxCol) {
      e.preventDefault()
      const next = { row, col: col + 1 }
      setSelAnchor(next); setSelEnd(next)
    } else if (e.key === 'ArrowLeft' && col > -1) {
      e.preventDefault()
      const next = { row, col: col - 1 }
      setSelAnchor(next); setSelEnd(next)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      setEditingCell({ row, col })
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // Clear selected cells
      e.preventDefault()
      if (selEnd) {
        const { minRow, maxRow, minCol, maxCol: mc } = getSelectionBounds(selAnchor, selEnd)
        setter(prev => {
          if (!prev) return prev
          const newRows = prev.rows.map((r, ri) => {
            if (ri < minRow || ri > maxRow) return r
            const newValues = [...r.values]
            let newTp = r.timepoint
            for (let ci = minCol; ci <= mc; ci++) {
              if (ci === -1) newTp = ''
              else newValues[ci] = ''
            }
            return { timepoint: newTp, values: newValues }
          })
          return { ...prev, rows: newRows }
        })
        setHasChanges(true)
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /[\d.\-]/.test(e.key)) {
      // Start typing a number — clear the cell and enter edit mode
      e.preventDefault()
      updateCell(setter, row, col, e.key)
      setEditingCell({ row, col })
    }
  }, [editingCell, selAnchor, selEnd, getActiveGrid, updateCell])

  // Copy/paste on the table container
  useEffect(() => {
    const el = tableRef.current
    if (!el) return

    const handleCopy = (e: ClipboardEvent) => {
      if (!selAnchor || !selEnd) return
      const [grid] = getActiveGrid()
      if (!grid) return

      const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selAnchor, selEnd)
      const lines: string[] = []
      for (let r = minRow; r <= maxRow; r++) {
        const cells: string[] = []
        for (let c = minCol; c <= maxCol; c++) {
          cells.push(getCellValue(grid, r, c))
        }
        lines.push(cells.join('\t'))
      }
      e.preventDefault()
      e.clipboardData?.setData('text/plain', lines.join('\n'))
    }

    const handlePaste = (e: ClipboardEvent) => {
      // If editing a cell, let the input handle the paste unless it's multi-cell
      if (editingCell) {
        const text = e.clipboardData?.getData('text/plain') ?? ''
        if (!text.includes('\t') && !text.includes('\n')) return
      }

      if (!selAnchor) return
      const [, setter] = getActiveGrid()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) return

      e.preventDefault()
      const pastedRows = text.trim().split('\n').map(line => line.split('\t'))
      const startRow = selAnchor.row
      const startCol = selAnchor.col

      setter(prev => {
        if (!prev) return prev
        const newRows = prev.rows.map(r => ({ ...r, values: [...r.values] }))
        pastedRows.forEach((pastedCols, ri) => {
          const targetRow = startRow + ri
          if (targetRow >= newRows.length) return
          pastedCols.forEach((val, ci) => {
            const targetCol = startCol + ci
            if (targetCol === -1) {
              newRows[targetRow] = { ...newRows[targetRow], timepoint: val.trim() }
            } else if (targetCol >= 0 && targetCol < prev.names.length) {
              newRows[targetRow].values[targetCol] = val.trim()
            }
          })
        })
        return { ...prev, rows: newRows }
      })
      setHasChanges(true)
      setEditingCell(null)
    }

    el.addEventListener('copy', handleCopy)
    el.addEventListener('paste', handlePaste)
    return () => {
      el.removeEventListener('copy', handleCopy)
      el.removeEventListener('paste', handlePaste)
    }
  }, [selAnchor, selEnd, editingCell, getActiveGrid])

  const handleAddRow = useCallback(() => {
    const [, setter] = getActiveGrid()
    setter(prev => {
      if (!prev) return prev
      const newRow = { timepoint: '0.00', values: prev.names.map(() => '0.00') }
      return { ...prev, rows: [...prev.rows, newRow] }
    })
    setHasChanges(true)
  }, [getActiveGrid])

  const handleAddColumn = useCallback(() => {
    setNewColumnName('')
    setShowAddColumnModal(true)
  }, [])

  const handleConfirmAddColumn = useCallback(() => {
    const [grid, setter] = getActiveGrid()
    if (!grid || !newColumnName.trim()) return
    if (grid.names.includes(newColumnName.trim())) return
    setter(prev => {
      if (!prev) return prev
      return {
        names: [...prev.names, newColumnName.trim()],
        rows: prev.rows.map(r => ({ ...r, values: [...r.values, ''] })),
      }
    })
    setHasChanges(true)
    setShowAddColumnModal(false)
    setNewColumnName('')
  }, [getActiveGrid, newColumnName])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const arrayBuffer = evt.target?.result
      if (!arrayBuffer) return
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      if (jsonData.length < 2) return

      const headers = jsonData[0].map(h => String(h ?? '').trim())
      const timeCol = headers.findIndex(h =>
        /^(time|timepoint|total process time)/i.test(h)
      )
      const names = headers.filter((_, i) => i !== timeCol && _ !== '')

      const rows = jsonData.slice(1)
        .filter(row => row && row.length > 0 && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''))
        .map(row => {
          const timepoint = timeCol >= 0 ? String(row[timeCol] ?? '').trim() : ''
          const values = headers.map((h, i) => {
            if (i === timeCol || h === '') return null
            const val = row[i]
            if (val === undefined || val === null || String(val).trim() === '') return ''
            const num = Number(val)
            return isNaN(num) ? String(val).trim() : num.toFixed(2)
          }).filter(v => v !== null) as string[]
          return { timepoint, values }
        })

      setProcessEdits({ names, rows })
      setHasChanges(true)
    }
    reader.readAsArrayBuffer(file)

    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }, [])

  const handleUpdate = async () => {
    console.log('Primary edits:', primaryEdits)
    console.log('Secondary edits:', secondaryEdits)
    setHasChanges(false)
  }

  const renderCell = (
    grid: GridData,
    setter: React.Dispatch<React.SetStateAction<GridData | null>>,
    row: number,
    col: number,
    value: string,
    align: 'left' | 'right',
    extraClass: string = ''
  ) => {
    const selected = isSelected(row, col)
    const editing = editingCell?.row === row && editingCell?.col === col

    if (editing) {
      return (
        <input
          autoFocus
          type="text"
          value={value}
          onChange={e => {
            const v = e.target.value
            if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
              updateCell(setter, row, col, v)
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              setEditingCell(null)
              if (e.key === 'Enter') {
                const nextRow = row + 1
                if (nextRow < grid.rows.length) {
                  setEditingCell({ row: nextRow, col })
                  setSelAnchor({ row: nextRow, col })
                  setSelEnd({ row: nextRow, col })
                }
              } else {
                const nextCol = col + 1
                if (nextCol < grid.names.length) {
                  setEditingCell({ row, col: nextCol })
                  setSelAnchor({ row, col: nextCol })
                  setSelEnd({ row, col: nextCol })
                }
              }
            }
            if (e.key === 'Escape') {
              setEditingCell(null)
            }
          }}
          onBlur={() => setEditingCell(null)}
          className={`w-full px-3 py-1.5 text-${align} text-gray-900 tabular-nums bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 ${extraClass}`}
        />
      )
    }

    return (
      <div
        className={`px-3 py-1.5 text-${align} tabular-nums select-none cursor-cell ${extraClass} ${
          selected ? 'bg-blue-100 outline outline-1 outline-blue-400' : ''
        }`}
        onMouseDown={e => handleMouseDown(row, col, e)}
        onMouseEnter={() => handleMouseEnter(row, col)}
      >
        {value}
      </div>
    )
  }

  const renderSpreadsheet = (
    grid: GridData | null,
    setter: React.Dispatch<React.SetStateAction<GridData | null>>,
    emptyMessage: string
  ) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
        </div>
      )
    }

    if (!grid || grid.names.length === 0) {
      return (
        <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <p className="text-gray-400 text-sm">{emptyMessage}</p>
        </div>
      )
    }

    return (
      <div ref={tableRef} tabIndex={0} onKeyDown={handleTableKeyDown} className="overflow-x-auto focus:outline-none">
        <table className="min-w-full border-collapse text-sm font-mono">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border border-gray-200 min-w-[100px]">
                Time
              </th>
              {grid.names.map(name => (
                <th key={name} className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase border border-gray-200 min-w-[100px]">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="sticky left-0 bg-inherit p-0 border border-gray-200">
                  {renderCell(grid, setter, i, -1, row.timepoint, 'left', 'font-medium text-gray-700')}
                </td>
                {row.values.map((val, j) => (
                  <td key={j} className="p-0 border border-gray-200">
                    {renderCell(grid, setter, i, j, val, 'right', 'text-gray-900')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === key
                ? 'border-b-2 border-[#eb5234] text-[#eb5234]'
                : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {!selectedExperiment ? (
          <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-gray-400 text-sm">Select an experiment to edit</p>
          </div>
        ) : activeTab === 'primary-products' ? (
          renderSpreadsheet(primaryEdits, setPrimaryEdits, 'No primary product data')
        ) : activeTab === 'secondary-products' ? (
          renderSpreadsheet(secondaryEdits, setSecondaryEdits, 'No secondary product data')
        ) : activeTab === 'process-data' ? (
          <>
            {(!processEdits || processEdits.names.length === 0) && (
              <div
                className="flex flex-col items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-gray-400 text-sm font-medium">Click to upload an Excel spreadsheet</p>
                <p className="text-gray-300 text-xs mt-1">.xlsx or .xls</p>
              </div>
            )}
            {processEdits && processEdits.names.length > 0 && (
              renderSpreadsheet(processEdits, setProcessEdits, 'No process data')
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-gray-400 text-sm">Coming soon</p>
          </div>
        )}

        {/* Action buttons */}
        {selectedExperiment && (activeTab === 'primary-products' || activeTab === 'secondary-products' || activeTab === 'process-data') && (
          <div className="flex justify-end gap-2 mt-4">
            {activeTab === 'process-data' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
              >
                Upload File
              </button>
            )}
            <button
              onClick={handleAddColumn}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
            >
              Add Column
            </button>
            <button
              onClick={handleAddRow}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
            >
              Add Row
            </button>
            <button
              onClick={handleUpdate}
              disabled={!hasChanges}
              className="px-6 py-2 text-sm font-medium text-white rounded-md shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: '#eb5234' }}
            >
              Update
            </button>
          </div>
        )}
      </div>

      {/* Add Column Modal */}
      {showAddColumnModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowAddColumnModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Column</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Column Name</label>
                <input
                  type="text"
                  value={newColumnName}
                  onChange={e => setNewColumnName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirmAddColumn() }}
                  placeholder="e.g. CBDa"
                  autoFocus
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAddColumnModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAddColumn}
                  disabled={!newColumnName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ backgroundColor: '#eb5234' }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default EditExperiment
