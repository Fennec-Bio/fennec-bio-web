'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'

interface ColumnMapping {
  column: string
  name: string
  category: 'product' | 'secondary_product' | 'process_data'
  unit: string
}

interface SheetConfig {
  sheet_name: string
  start_row: number
  timepoint_column: string
  time_unit: string
  column_mappings: ColumnMapping[]
}

interface DataTemplate {
  id: number
  name: string
  project: number
  sheets: SheetConfig[]
  // Legacy fields (kept for backward compat)
  sheet_name: string
  timepoint_column: string
  time_unit: string
  column_mappings: ColumnMapping[]
  created_at: string
  updated_at: string
}

interface UniqueNames {
  products: string[]
  secondary_products: string[]
  process_data: string[]
}

const TIME_UNIT_OPTIONS = [
  { value: 'hours', label: 'Hours' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'days', label: 'Days' },
  { value: 'hh:mm:ss', label: 'HH:MM:SS' },
]

const COLUMN_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))

const CATEGORY_COLORS: Record<string, { dot: string; label: string }> = {
  product: { dot: 'bg-[#eb5234]', label: 'Product' },
  secondary_product: { dot: 'bg-blue-500', label: 'Secondary' },
  process_data: { dot: 'bg-emerald-500', label: 'Process' },
}

function emptySheet(): SheetConfig {
  return { sheet_name: '', start_row: 1, timepoint_column: 'A', time_unit: 'days', column_mappings: [] }
}

export function DataTemplates() {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  const [templates, setTemplates] = useState<DataTemplate[]>([])
  const [uniqueNames, setUniqueNames] = useState<UniqueNames>({ products: [], secondary_products: [], process_data: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formSheets, setFormSheets] = useState<SheetConfig[]>([emptySheet()])
  const [activeSheetIdx, setActiveSheetIdx] = useState(0)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const fetchTemplates = useCallback(async () => {
    if (!activeProject) return
    setIsLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/data-templates/?project_id=${activeProject.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setTemplates(await res.json())
      }
    } catch {
      setError('Failed to load templates')
    } finally {
      setIsLoading(false)
    }
  }, [activeProject, apiUrl, getToken])

  const fetchUniqueNames = useCallback(async () => {
    if (!activeProject) return
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/uniqueNames/?project_id=${activeProject.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUniqueNames({
          products: data.products || [],
          secondary_products: data.secondary_products || [],
          process_data: data.process_data || [],
        })
      }
    } catch {
      // Non-critical — dropdowns will just be empty
    }
  }, [activeProject, apiUrl, getToken])

  useEffect(() => {
    fetchTemplates()
    fetchUniqueNames()
  }, [fetchTemplates, fetchUniqueNames])

  const namesByCategory: Record<string, string[]> = {
    product: uniqueNames.products,
    secondary_product: uniqueNames.secondary_products,
    process_data: uniqueNames.process_data,
  }

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setFormName('')
    setFormSheets([emptySheet()])
    setActiveSheetIdx(0)
    setFormError('')
  }

  const startCreate = () => {
    resetForm()
    setIsEditing(true)
  }

  const startEdit = (t: DataTemplate) => {
    setEditingId(t.id)
    setFormName(t.name)
    const sheets = t.sheets && t.sheets.length > 0 ? t.sheets.map(s => ({ ...s, column_mappings: [...s.column_mappings] })) : [emptySheet()]
    setFormSheets(sheets)
    setActiveSheetIdx(0)
    setFormError('')
    setIsEditing(true)
  }

  // Sheet-level helpers
  const activeSheet = formSheets[activeSheetIdx] || emptySheet()

  const updateActiveSheet = (updates: Partial<SheetConfig>) => {
    setFormSheets(prev => prev.map((s, i) => i === activeSheetIdx ? { ...s, ...updates } : s))
  }

  const addSheet = () => {
    setFormSheets(prev => [...prev, emptySheet()])
    setActiveSheetIdx(formSheets.length)
  }

  const removeSheet = (idx: number) => {
    if (formSheets.length <= 1) return
    setFormSheets(prev => prev.filter((_, i) => i !== idx))
    setActiveSheetIdx(prev => prev >= idx ? Math.max(0, prev - 1) : prev)
  }

  const addMapping = () => {
    const usedColumns = activeSheet.column_mappings.map(m => m.column)
    const nextColumn = COLUMN_LETTERS.find(l => l !== activeSheet.timepoint_column && !usedColumns.includes(l)) || 'B'
    updateActiveSheet({ column_mappings: [...activeSheet.column_mappings, { column: nextColumn, name: '', category: 'product', unit: '' }] })
  }

  const updateMapping = (index: number, field: keyof ColumnMapping, value: string) => {
    const updated = [...activeSheet.column_mappings]
    if (field === 'category') {
      updated[index] = { ...updated[index], category: value as ColumnMapping['category'], name: '', unit: '' }
    } else if (field === 'name') {
      updated[index] = { ...updated[index], name: value }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    updateActiveSheet({ column_mappings: updated })
  }

  const removeMapping = (index: number) => {
    updateActiveSheet({ column_mappings: activeSheet.column_mappings.filter((_, i) => i !== index) })
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('Template name is required')
      return
    }
    const totalMappings = formSheets.reduce((sum, s) => sum + s.column_mappings.length, 0)
    if (totalMappings === 0) {
      setFormError('Add at least one column mapping')
      return
    }

    setIsSaving(true)
    setFormError('')

    try {
      const token = await getToken()
      // Use first sheet's values for legacy fields
      const first = formSheets[0]
      const payload = {
        name: formName.trim(),
        project_id: activeProject!.id,
        project: activeProject!.id,
        sheet_name: first.sheet_name,
        timepoint_column: first.timepoint_column,
        time_unit: first.time_unit,
        column_mappings: first.column_mappings,
        sheets: formSheets,
      }

      const url = editingId
        ? `${apiUrl}/api/data-templates/${editingId}/`
        : `${apiUrl}/api/data-templates/`
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        resetForm()
        fetchTemplates()
      } else {
        const data = await res.json()
        setFormError(data.error || 'Failed to save template')
      }
    } catch {
      setFormError('Failed to save template')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/data-templates/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        fetchTemplates()
      }
    } catch {
      setError('Failed to delete template')
    }
  }

  if (!activeProject) {
    return <p className="text-sm text-gray-500">Select a project to manage data templates.</p>
  }

  // Editing form
  if (isEditing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {editingId ? 'Edit Template' : 'New Template'}
          </h3>
          <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {formError && (
          <div className="text-red-600 bg-red-50 p-2 rounded mb-4 text-sm">{formError}</div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
          <input
            type="text"
            value={formName}
            onChange={e => setFormName(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Standard Titres Sheet"
          />
        </div>

        {/* Sheet tabs */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Sheets / Tabs</label>
          <div className="flex items-center gap-1 border-b border-gray-200">
            {formSheets.map((sheet, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSheetIdx(idx)}
                className={`
                  relative px-3 py-2 text-sm font-medium rounded-t-md transition-colors
                  ${idx === activeSheetIdx
                    ? 'bg-white border border-gray-200 border-b-white -mb-px text-gray-900'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                {sheet.sheet_name || `Sheet ${idx + 1}`}
                {formSheets.length > 1 && idx === activeSheetIdx && (
                  <span
                    onClick={(e) => { e.stopPropagation(); removeSheet(idx) }}
                    className="ml-2 text-gray-400 hover:text-red-500 inline-flex"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={addSheet}
              className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Add sheet"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Active sheet config */}
        <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sheet / Tab Name</label>
            <input
              type="text"
              value={activeSheet.sheet_name}
              onChange={e => updateActiveSheet({ sheet_name: e.target.value })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Summary (leave blank for first sheet)"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Header Row</label>
            <input
              type="text"
              inputMode="numeric"
              value={activeSheet.start_row === 0 ? '' : activeSheet.start_row}
              onChange={e => {
                const raw = e.target.value.replace(/\D/g, '')
                updateActiveSheet({ start_row: raw === '' ? 0 : parseInt(raw) })
              }}
              onBlur={() => { if (!activeSheet.start_row) updateActiveSheet({ start_row: 1 }) }}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Row number containing column headers (1-based). Data is read from the row below.</p>
          </div>

          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Timepoint Column</label>
              <select
                value={activeSheet.timepoint_column}
                onChange={e => updateActiveSheet({ timepoint_column: e.target.value })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {COLUMN_LETTERS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Unit</label>
              <select
                value={activeSheet.time_unit}
                onChange={e => updateActiveSheet({ time_unit: e.target.value })}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIME_UNIT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">Column Mappings</label>

          {activeSheet.column_mappings.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
              <div className="grid grid-cols-[60px_120px_1fr_80px_32px] gap-0 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                <span>Col</span><span>Category</span><span>Name</span><span>Unit</span><span />
              </div>
              {activeSheet.column_mappings.map((m, i) => (
                <div key={i} className="grid grid-cols-[60px_120px_1fr_80px_32px] gap-0 px-3 py-2 border-t border-gray-100 items-center">
                  <select
                    value={m.column}
                    onChange={e => updateMapping(i, 'column', e.target.value)}
                    className="border border-gray-200 rounded px-1 py-1 text-sm w-12"
                  >
                    {COLUMN_LETTERS.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>

                  <select
                    value={m.category}
                    onChange={e => updateMapping(i, 'category', e.target.value)}
                    className="border border-gray-200 rounded px-1 py-1 text-sm"
                  >
                    <option value="product">Product</option>
                    <option value="secondary_product">Secondary</option>
                    <option value="process_data">Process</option>
                  </select>

                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[m.category]?.dot || 'bg-gray-300'}`} />
                    {m.name !== '' && !(namesByCategory[m.category] || []).includes(m.name) ? (
                      <input
                        type="text"
                        value={m.name}
                        onChange={e => updateMapping(i, 'name', e.target.value)}
                        className="border border-gray-200 rounded px-1 py-1 text-sm flex-1 min-w-0"
                        placeholder="Type name..."
                        autoFocus
                      />
                    ) : (
                      <select
                        value={m.name}
                        onChange={e => {
                          if (e.target.value === '__add_new__') {
                            window.open('/settings#data-categories', '_blank')
                          } else {
                            updateMapping(i, 'name', e.target.value)
                          }
                        }}
                        className="border border-gray-200 rounded px-1 py-1 text-sm flex-1 min-w-0"
                      >
                        <option value="">Select name...</option>
                        {(namesByCategory[m.category] || []).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                        <option value="__add_new__">Add new...</option>
                      </select>
                    )}
                  </div>

                  <span className="text-sm text-gray-500 truncate">{m.unit || '—'}</span>

                  <button onClick={() => removeMapping(i)} className="text-gray-300 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addMapping}
            className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            + Add Column Mapping
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-[#eb5234] text-white rounded-md py-2 text-sm font-medium hover:bg-[#d4462c] disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Template'}
          </button>
          <button
            onClick={resetForm}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Data Templates</h3>
        <button
          onClick={startCreate}
          className="h-9 px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4462c] transition-all flex items-center gap-1"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {error && <div className="text-red-600 bg-red-50 p-2 rounded mb-4 text-sm">{error}</div>}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse bg-gray-200 rounded h-16" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No templates yet for this project.</p>
          <p className="text-xs mt-1">Create a template to define column mappings for your spreadsheets.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {templates.map((t, i) => {
            const sheets = t.sheets && t.sheets.length > 0 ? t.sheets : []
            const totalCols = sheets.reduce((sum, s) => sum + s.column_mappings.length, 0)
            return (
              <div
                key={t.id}
                className={`px-4 py-3 flex items-center justify-between ${i < templates.length - 1 ? 'border-b border-gray-200' : ''}`}
              >
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-gray-500">
                    {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
                    {sheets.length > 0 && (
                      <> · {sheets.map(s => s.sheet_name || 'Default').join(', ')}</>
                    )}
                    {' · '}{totalCols} column{totalCols !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => startEdit(t)} className="text-[#eb5234] hover:text-[#d4462c] text-sm flex items-center gap-1">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-500 text-sm flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
