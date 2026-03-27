'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'

export interface GridData {
  names: string[]
  rows: { timepoint: string; values: string[] }[]
}

export interface CellPos {
  row: number
  col: number
}

export function parseTimepoint(tp: string): number {
  const n = parseFloat(tp)
  return isNaN(n) ? 0 : n
}

export function buildSpreadsheet(products: { name: string; timepoint: string; value: number }[]): GridData {
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

const TIME_UNIT_OPTIONS = [
  { value: 'hours', label: 'Time (hours)' },
  { value: 'minutes', label: 'Time (minutes)' },
  { value: 'days', label: 'Time (days)' },
  { value: 'hh:mm:ss', label: 'Time (HH:MM:SS)' },
]

interface SpreadsheetGridProps {
  grid: GridData
  onChange: (grid: GridData) => void
  readOnly?: boolean
  truncated?: boolean
  showAddRow?: boolean
  showAddColumn?: boolean
  timeUnit?: string
  onTimeUnitChange?: (unit: string) => void
}

export function SpreadsheetGrid({
  grid,
  onChange,
  readOnly = false,
  truncated = false,
  showAddRow = false,
  showAddColumn = false,
  timeUnit,
  onTimeUnitChange,
}: SpreadsheetGridProps) {
  const [selAnchor, setSelAnchor] = useState<CellPos | null>(null)
  const [selEnd, setSelEnd] = useState<CellPos | null>(null)
  const [editingCell, setEditingCell] = useState<CellPos | null>(null)
  const isDragging = useRef(false)
  const tableRef = useRef<HTMLDivElement>(null)

  // Add column modal
  const [showAddColumnModal, setShowAddColumnModal] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')

  // Reset selection when grid identity changes (e.g. tab switch)
  const prevGridRef = useRef(grid)
  useEffect(() => {
    if (prevGridRef.current !== grid) {
      prevGridRef.current = grid
    }
  }, [grid])

  const updateCell = useCallback((row: number, col: number, value: string) => {
    const newRows = grid.rows.map((r, i) => {
      if (i !== row) return r
      if (col === -1) return { ...r, timepoint: value }
      const newValues = [...r.values]
      newValues[col] = value
      return { ...r, values: newValues }
    })
    onChange({ ...grid, rows: newRows })
  }, [grid, onChange])

  const isSelected = useCallback((row: number, col: number) => {
    if (!selAnchor || !selEnd) return false
    const { minRow, maxRow, minCol, maxCol } = getSelectionBounds(selAnchor, selEnd)
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
  }, [selAnchor, selEnd])

  const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.detail === 2 && !readOnly && !truncated) {
      setEditingCell({ row, col })
      setSelAnchor({ row, col })
      setSelEnd({ row, col })
      return
    }
    setEditingCell(null)
    if (e.shiftKey && selAnchor) {
      setSelEnd({ row, col })
    } else {
      setSelAnchor({ row, col })
      setSelEnd({ row, col })
    }
    isDragging.current = true
  }, [selAnchor, readOnly, truncated])

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

  // Keyboard navigation
  const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editingCell) return
    if (!selAnchor) return

    const { row, col } = selAnchor
    const maxCol = grid.names.length - 1

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
    } else if (e.key === 'Enter' && !readOnly && !truncated) {
      e.preventDefault()
      setEditingCell({ row, col })
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly && !truncated) {
      e.preventDefault()
      if (selEnd) {
        const { minRow, maxRow, minCol, maxCol: mc } = getSelectionBounds(selAnchor, selEnd)
        const newRows = grid.rows.map((r, ri) => {
          if (ri < minRow || ri > maxRow) return r
          const newValues = [...r.values]
          let newTp = r.timepoint
          for (let ci = minCol; ci <= mc; ci++) {
            if (ci === -1) newTp = ''
            else newValues[ci] = ''
          }
          return { timepoint: newTp, values: newValues }
        })
        onChange({ ...grid, rows: newRows })
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /[\d.\-]/.test(e.key) && !readOnly && !truncated) {
      e.preventDefault()
      updateCell(row, col, e.key)
      setEditingCell({ row, col })
    }
  }, [editingCell, selAnchor, selEnd, grid, onChange, updateCell, readOnly, truncated])

  // Copy/paste
  useEffect(() => {
    const el = tableRef.current
    if (!el) return

    const handleCopy = (e: ClipboardEvent) => {
      if (!selAnchor || !selEnd) return
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
      if (readOnly || truncated) return

      if (editingCell) {
        const text = e.clipboardData?.getData('text/plain') ?? ''
        if (!text.includes('\t') && !text.includes('\n')) return
      }

      if (!selAnchor) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (!text) return

      e.preventDefault()
      const pastedRows = text.trim().split('\n').map(line => line.split('\t'))
      const startRow = selAnchor.row
      const startCol = selAnchor.col

      const newRows = grid.rows.map(r => ({ ...r, values: [...r.values] }))
      pastedRows.forEach((pastedCols, ri) => {
        const targetRow = startRow + ri
        if (targetRow >= newRows.length) return
        pastedCols.forEach((val, ci) => {
          const targetCol = startCol + ci
          if (targetCol === -1) {
            newRows[targetRow] = { ...newRows[targetRow], timepoint: val.trim() }
          } else if (targetCol >= 0 && targetCol < grid.names.length) {
            newRows[targetRow].values[targetCol] = val.trim()
          }
        })
      })
      onChange({ ...grid, rows: newRows })
      setEditingCell(null)
    }

    el.addEventListener('copy', handleCopy)
    el.addEventListener('paste', handlePaste)
    return () => {
      el.removeEventListener('copy', handleCopy)
      el.removeEventListener('paste', handlePaste)
    }
  }, [selAnchor, selEnd, editingCell, grid, onChange, readOnly, truncated])

  const handleAddRow = useCallback(() => {
    const newRow = { timepoint: '0.00', values: grid.names.map(() => '0.00') }
    onChange({ ...grid, rows: [...grid.rows, newRow] })
  }, [grid, onChange])

  const handleAddColumn = useCallback(() => {
    setNewColumnName('')
    setShowAddColumnModal(true)
  }, [])

  const handleConfirmAddColumn = useCallback(() => {
    if (!newColumnName.trim()) return
    if (grid.names.includes(newColumnName.trim())) return
    onChange({
      names: [...grid.names, newColumnName.trim()],
      rows: grid.rows.map(r => ({ ...r, values: [...r.values, ''] })),
    })
    setShowAddColumnModal(false)
    setNewColumnName('')
  }, [grid, onChange, newColumnName])

  const renderCell = (
    row: number,
    col: number,
    value: string,
    align: 'left' | 'right',
    extraClass: string = ''
  ) => {
    const selected = isSelected(row, col)
    const editing = editingCell?.row === row && editingCell?.col === col

    if (editing && !readOnly && !truncated) {
      return (
        <input
          autoFocus
          type="text"
          value={value}
          onChange={e => {
            const v = e.target.value
            if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
              updateCell(row, col, v)
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

  // Compute rows to display for truncated mode
  const displayRows: { originalIndex: number; row: GridData['rows'][number] }[] = []
  let hiddenCount = 0

  if (truncated && grid.rows.length > 20) {
    for (let i = 0; i < 10; i++) {
      displayRows.push({ originalIndex: i, row: grid.rows[i] })
    }
    hiddenCount = grid.rows.length - 20
    for (let i = grid.rows.length - 10; i < grid.rows.length; i++) {
      displayRows.push({ originalIndex: i, row: grid.rows[i] })
    }
  } else {
    grid.rows.forEach((row, i) => {
      displayRows.push({ originalIndex: i, row })
    })
  }

  return (
    <>
      <div ref={tableRef} tabIndex={0} onKeyDown={handleTableKeyDown} className="overflow-x-auto focus:outline-none">
        <table className="min-w-full border-collapse text-sm font-mono">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border border-gray-200 min-w-[100px]">
                {timeUnit && onTimeUnitChange ? (
                  <select
                    value={timeUnit}
                    onChange={e => onTimeUnitChange(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-gray-500 uppercase cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
                  >
                    {TIME_UNIT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : timeUnit ? (
                  TIME_UNIT_OPTIONS.find(o => o.value === timeUnit)?.label ?? 'Time'
                ) : (
                  'Time'
                )}
              </th>
              {grid.names.map(name => (
                <th key={name} className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase border border-gray-200 min-w-[100px]">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map(({ originalIndex, row }, displayIdx) => (
              <React.Fragment key={originalIndex}>
                {truncated && hiddenCount > 0 && displayIdx === 10 && (
                  <tr>
                    <td
                      colSpan={grid.names.length + 1}
                      className="px-3 py-2 text-center text-xs text-gray-400 bg-gray-50 border border-gray-200 italic"
                    >
                      {hiddenCount} rows hidden
                    </td>
                  </tr>
                )}
                <tr className={originalIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="sticky left-0 bg-inherit p-0 border border-gray-200">
                    {renderCell(originalIndex, -1, row.timepoint, 'left', 'font-medium text-gray-700')}
                  </td>
                  {row.values.map((val, j) => (
                    <td key={j} className="p-0 border border-gray-200">
                      {renderCell(originalIndex, j, val, 'right', 'text-gray-900')}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      {(showAddRow || showAddColumn) && !readOnly && !truncated && (
        <div className="flex justify-end gap-2 mt-4">
          {showAddColumn && (
            <button
              onClick={handleAddColumn}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
            >
              Add Column
            </button>
          )}
          {showAddRow && (
            <button
              onClick={handleAddRow}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
            >
              Add Row
            </button>
          )}
        </div>
      )}

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
    </>
  )
}

export default SpreadsheetGrid
