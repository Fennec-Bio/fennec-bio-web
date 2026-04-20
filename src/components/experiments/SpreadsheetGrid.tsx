'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

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
  collapseAfter?: number
  /** Names that may replace the column at `col`. Should NOT include the current
   *  name. When provided alongside `onRenameColumn`, the column header becomes
   *  a select. */
  availableNamesForColumn?: (col: number) => string[]
  onRenameColumn?: (col: number, newName: string) => void
  /** When provided, an × button is rendered next to each non-time column header. */
  onDeleteColumn?: (col: number) => void
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
  collapseAfter,
  availableNamesForColumn,
  onRenameColumn,
  onDeleteColumn,
}: SpreadsheetGridProps) {
  const [selAnchor, setSelAnchor] = useState<CellPos | null>(null)
  const [selEnd, setSelEnd] = useState<CellPos | null>(null)
  const [editingCell, setEditingCell] = useState<CellPos | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const isDragging = useRef(false)
  const tableRef = useRef<HTMLDivElement>(null)

  // Reset collapsed state when the grid's structure changes (tab switch
  // or Add Column). Compare the names array reference, not the full grid
  // object — the parent produces a new grid object on every cell edit,
  // and we don't want those to reset the toggle.
  const prevNamesRef = useRef(grid.names)
  useEffect(() => {
    if (prevNamesRef.current !== grid.names) {
      prevNamesRef.current = grid.names
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCollapsed(true)
    }
  }, [grid.names])

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

      // Auto-expand if the paste would write into a hidden row.
      // React batches the state update with the onChange below, so the
      // user sees the expanded grid with pasted data in a single render.
      const maxTargetRow = startRow + pastedRows.length - 1
      if (collapseAfter && isCollapsed && maxTargetRow >= collapseAfter) {
        setIsCollapsed(false)
      }

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
  }, [selAnchor, selEnd, editingCell, grid, onChange, readOnly, truncated, isCollapsed, collapseAfter])

  const handleAddRow = useCallback(() => {
    if (collapseAfter && isCollapsed) {
      setIsCollapsed(false)
    }
    const newRow = { timepoint: '0.00', values: grid.names.map(() => '0.00') }
    onChange({ ...grid, rows: [...grid.rows, newRow] })
  }, [grid, onChange, collapseAfter, isCollapsed])

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

  // Compute rows to display for collapsed (edit) and truncated (review) modes
  const displayRows: { originalIndex: number; row: GridData['rows'][number] }[] = []
  let hiddenCount = 0

  if (collapseAfter && isCollapsed && grid.rows.length > collapseAfter) {
    for (let i = 0; i < collapseAfter; i++) {
      displayRows.push({ originalIndex: i, row: grid.rows[i] })
    }
    hiddenCount = grid.rows.length - collapseAfter
  } else if (truncated && grid.rows.length > 20) {
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
              {grid.names.map((name, colIdx) => {
                const canEditHeader = !readOnly && !truncated
                const renameOptions = canEditHeader && onRenameColumn && availableNamesForColumn
                  ? availableNamesForColumn(colIdx)
                  : null
                return (
                  <th key={`${name}-${colIdx}`} className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase border border-gray-200 min-w-[140px]">
                    <div className="flex items-center justify-end gap-1.5">
                      {renameOptions ? (
                        <select
                          value={name}
                          onChange={e => onRenameColumn!(colIdx, e.target.value)}
                          className="appearance-none bg-white border border-gray-300 rounded-md px-2.5 py-1 pr-6 text-xs font-semibold text-gray-700 uppercase cursor-pointer shadow-xs hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors max-w-[160px] bg-no-repeat bg-right"
                          style={{
                            backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                            backgroundPosition: 'right 6px center',
                          }}
                          title="Rename column"
                        >
                          <option value={name}>{name}</option>
                          {renameOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{name}</span>
                      )}
                      {canEditHeader && onDeleteColumn && (
                        <button
                          type="button"
                          onClick={() => onDeleteColumn(colIdx)}
                          className="flex items-center justify-center w-6 h-6 text-base text-gray-500 hover:text-white hover:bg-red-500 border border-gray-300 hover:border-red-500 rounded-md shadow-xs transition-colors leading-none"
                          aria-label={`Delete column ${name}`}
                          title={`Delete column ${name}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>
                )
              })}
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

      {/* Collapse / expand toggle */}
      {collapseAfter && grid.rows.length > collapseAfter && !readOnly && !truncated && (
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-center gap-2 mt-2 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-dashed border-gray-200 rounded-md transition-colors"
        >
          {isCollapsed ? (
            <>Show all {grid.rows.length} rows <ChevronDown className="h-4 w-4" /></>
          ) : (
            <>Show first {collapseAfter} rows <ChevronUp className="h-4 w-4" /></>
          )}
        </button>
      )}

      {showAddRow && !readOnly && !truncated && (
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={handleAddRow}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
          >
            Add Row
          </button>
        </div>
      )}

    </>
  )
}

export default SpreadsheetGrid
