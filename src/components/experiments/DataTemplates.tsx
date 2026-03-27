'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

interface ColumnMapping {
  column: string
  name: string
  category: 'product' | 'secondary_product' | 'process_data'
  unit: string
}

interface DataTemplate {
  id: number
  name: string
  project: number
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

function getCategoryForName(name: string, uniqueNames: UniqueNames): 'product' | 'secondary_product' | 'process_data' | null {
  if (uniqueNames.products.includes(name)) return 'product'
  if (uniqueNames.secondary_products.includes(name)) return 'secondary_product'
  if (uniqueNames.process_data.includes(name)) return 'process_data'
  return null
}

const CATEGORY_COLORS: Record<string, { dot: string; label: string }> = {
  product: { dot: 'bg-[#eb5234]', label: 'Product' },
  secondary_product: { dot: 'bg-blue-500', label: 'Secondary' },
  process_data: { dot: 'bg-emerald-500', label: 'Process' },
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
  const [formTimepointColumn, setFormTimepointColumn] = useState('A')
  const [formTimeUnit, setFormTimeUnit] = useState('days')
  const [formMappings, setFormMappings] = useState<ColumnMapping[]>([])
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
    setFormTimepointColumn('A')
    setFormTimeUnit('days')
    setFormMappings([])
    setFormError('')
  }

  const startCreate = () => {
    resetForm()
    setIsEditing(true)
  }

  const startEdit = (t: DataTemplate) => {
    setEditingId(t.id)
    setFormName(t.name)
    setFormTimepointColumn(t.timepoint_column)
    setFormTimeUnit(t.time_unit)
    setFormMappings([...t.column_mappings])
    setFormError('')
    setIsEditing(true)
  }

  const addMapping = () => {
    const usedColumns = formMappings.map(m => m.column)
    const nextColumn = COLUMN_LETTERS.find(l => l !== formTimepointColumn && !usedColumns.includes(l)) || 'B'
    setFormMappings([...formMappings, { column: nextColumn, name: '', category: 'product', unit: '' }])
  }

  const updateMapping = (index: number, field: keyof ColumnMapping, value: string) => {
    const updated = [...formMappings]
    if (field === 'category') {
      // When category changes, clear name since it may not belong to the new category
      updated[index] = { ...updated[index], category: value as ColumnMapping['category'], name: '', unit: '' }
    } else if (field === 'name') {
      updated[index] = { ...updated[index], name: value }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setFormMappings(updated)
  }

  const removeMapping = (index: number) => {
    setFormMappings(formMappings.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('Template name is required')
      return
    }
    if (formMappings.length === 0) {
      setFormError('Add at least one column mapping')
      return
    }

    setIsSaving(true)
    setFormError('')

    try {
      const token = await getToken()
      const payload = {
        name: formName.trim(),
        project_id: activeProject!.id,
        project: activeProject!.id,
        timepoint_column: formTimepointColumn,
        time_unit: formTimeUnit,
        column_mappings: formMappings,
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

        <div className="flex gap-3 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Timepoint Column</label>
            <select
              value={formTimepointColumn}
              onChange={e => setFormTimepointColumn(e.target.value)}
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
              value={formTimeUnit}
              onChange={e => setFormTimeUnit(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TIME_UNIT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-2">Column Mappings</label>

        {formMappings.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
            <div className="grid grid-cols-[60px_120px_1fr_80px_32px] gap-0 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
              <span>Col</span><span>Category</span><span>Name</span><span>Unit</span><span />
            </div>
            {formMappings.map((m, i) => (
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
                  <input
                    type="text"
                    list={`names-${i}`}
                    value={m.name}
                    onChange={e => updateMapping(i, 'name', e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-sm flex-1 min-w-0"
                    placeholder="Select or type..."
                  />
                  <datalist id={`names-${i}`}>
                    {(namesByCategory[m.category] || []).map(n => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
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
          className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:bg-gray-50 mb-4"
        >
          + Add Column Mapping
        </button>

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
          {templates.map((t, i) => (
            <div
              key={t.id}
              className={`px-4 py-3 flex items-center justify-between ${i < templates.length - 1 ? 'border-b border-gray-200' : ''}`}
            >
              <div>
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-gray-500">
                  {t.column_mappings.length} column{t.column_mappings.length !== 1 ? 's' : ''} · Time unit: {t.time_unit}
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
          ))}
        </div>
      )}
    </div>
  )
}
