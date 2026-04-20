'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { Plus, Pencil, Trash2, X, Check, ArrowRightLeft } from 'lucide-react'

type DataType = 'discrete' | 'continuous' | 'point'
type Operator = '+' | '-' | '*' | '/'

interface DataCategory {
  id: number
  project: number
  category: 'product' | 'secondary_product' | 'process_data' | 'custom'
  name: string
  unit: string
  data_type: DataType
  formula_operand_a: number | null
  formula_operand_b: number | null
  formula_operator: Operator | null
  is_stale: boolean
}

type CategoryTab = 'product' | 'secondary_product' | 'process_data' | 'custom'

const TABS: { key: CategoryTab; label: string }[] = [
  { key: 'product', label: 'Products' },
  { key: 'secondary_product', label: 'Secondary Products' },
  { key: 'process_data', label: 'Process Data' },
  { key: 'custom', label: 'Custom' },
]

const OPERATOR_LABELS: Record<Operator, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
}

const DATA_TYPE_OPTIONS: { value: DataType; label: string }[] = [
  { value: 'discrete', label: 'Discrete' },
  { value: 'continuous', label: 'Continuous' },
  { value: 'point', label: 'Point' },
]

const DATA_TYPE_DESCRIPTIONS: Record<DataType, string> = {
  point:
    'Data that is a single time independent point. E.g total protein harvested after a run.',
  discrete:
    'A set of data timepoints, e.g the concentration of a metabolite sampled every 24 hours.',
  continuous:
    'A set of datapoints with over 100 samples e.g measurements of a pH probe.',
}

const dataTypeBadgeClass = (dt: DataType): string => {
  if (dt === 'continuous') return 'bg-blue-100 text-blue-800'
  if (dt === 'point') return 'bg-purple-100 text-purple-800'
  return 'bg-green-100 text-green-800'
}

const dataTypeLabel = (dt: DataType): string =>
  DATA_TYPE_OPTIONS.find(o => o.value === dt)?.label ?? dt

const inputClass =
  'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function DataCategoryManager() {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  const [categories, setCategories] = useState<DataCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<CategoryTab>('product')
  const [error, setError] = useState('')

  // Inline add state
  const [isAdding, setIsAdding] = useState(false)
  const [addName, setAddName] = useState('')
  const [addUnit, setAddUnit] = useState('mg/L')
  const [addDataType, setAddDataType] = useState<DataType>('discrete')
  const [addError, setAddError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Custom-tab add/edit form state
  const [customFormOpen, setCustomFormOpen] = useState(false)
  const [customFormEditId, setCustomFormEditId] = useState<number | null>(null)
  const [customName, setCustomName] = useState('')
  const [customUnit, setCustomUnit] = useState('')
  const [customOperandA, setCustomOperandA] = useState<number | ''>('')
  const [customOperator, setCustomOperator] = useState<Operator>('/')
  const [customOperandB, setCustomOperandB] = useState<number | ''>('')
  const [customError, setCustomError] = useState('')
  const [isSavingCustom, setIsSavingCustom] = useState(false)

  const resetCustomForm = () => {
    setCustomFormOpen(false)
    setCustomFormEditId(null)
    setCustomName('')
    setCustomUnit('')
    setCustomOperandA('')
    setCustomOperator('/')
    setCustomOperandB('')
    setCustomError('')
  }

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editDataType, setEditDataType] = useState<DataType>('discrete')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<DataCategory | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Convert popover + modal state
  const [convertPopoverId, setConvertPopoverId] = useState<number | null>(null)
  const [convertTarget, setConvertTarget] = useState<{ cat: DataCategory; newCategory: CategoryTab } | null>(null)
  const [convertError, setConvertError] = useState('')
  const [isConverting, setIsConverting] = useState(false)

  // Data-type change confirmation: pending edit waits for the user to acknowledge
  // that any existing rows recorded under the old shape may not render correctly
  // under the new one (e.g. switching a multi-row series to "point").
  const [dataTypeChangeConfirm, setDataTypeChangeConfirm] = useState<{
    id: number
    oldType: DataType
    newType: DataType
  } | null>(null)

  const fetchCategories = useCallback(async () => {
    if (!activeProject) return
    setIsLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${apiUrl}/api/data-categories/?project_id=${activeProject.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        setCategories(await res.json())
      }
    } catch {
      setError('Failed to load categories')
    } finally {
      setIsLoading(false)
    }
  }, [activeProject, apiUrl, getToken])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    if (convertPopoverId === null) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-convert-popover]') && !target.closest('[data-convert-trigger]')) {
        setConvertPopoverId(null)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConvertPopoverId(null)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [convertPopoverId])

  const filtered = categories.filter(c => c.category === activeTab)

  const handleAdd = async () => {
    if (!addName.trim()) {
      setAddError('Name is required')
      return
    }
    if (!activeProject) return
    setIsSaving(true)
    setAddError('')
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/data-categories/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: activeProject.id,
          category: activeTab,
          name: addName.trim(),
          unit: addUnit.trim() || 'mg/L',
          data_type: addDataType,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setCategories(prev => [...prev, created])
        setAddName('')
        setAddUnit('mg/L')
        setAddDataType('discrete')
        setIsAdding(false)
      } else {
        const data = await res.json()
        setAddError(data.error || 'Failed to add')
      }
    } catch {
      setAddError('Failed to add')
    } finally {
      setIsSaving(false)
    }
  }

  // Save click from inline edit row. If the user changed data_type we don't
  // commit straight away — we surface a warning first because the change
  // rewrites every attached DataPoint and may make existing rows render
  // incorrectly (e.g. a multi-point series flipped to "point").
  const handleSaveClick = (id: number) => {
    if (!editName.trim()) return
    const cat = categories.find(c => c.id === id)
    if (!cat) return
    if (cat.data_type !== editDataType) {
      setDataTypeChangeConfirm({ id, oldType: cat.data_type, newType: editDataType })
      return
    }
    handleUpdate(id)
  }

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) return
    try {
      const token = await getToken()
      const cat = categories.find(c => c.id === id)
      if (!cat) return
      const res = await fetch(`${apiUrl}/api/data-categories/${id}/`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: cat.category,
          name: editName.trim(),
          unit: editUnit.trim() || 'mg/L',
          data_type: editDataType,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setCategories(prev => prev.map(c => c.id === id ? updated : c))
        setEditingId(null)
      }
    } catch {
      // silently fail
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/data-categories/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setCategories(prev => prev.filter(c => c.id !== id))
      }
    } catch {
      // silently fail
    }
  }

  const handleConvert = async (cat: DataCategory, newCategory: CategoryTab) => {
    if (!activeProject) return
    setIsConverting(true)
    setConvertError('')
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/data-categories/${cat.id}/convert/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category: newCategory }),
      })
      if (res.ok) {
        const updated: DataCategory = await res.json()
        if (!updated || typeof updated.id !== 'number' || updated.category !== newCategory) {
          setConvertError('Unexpected server response. Please refresh.')
          return
        }
        setCategories(prev => prev.map(c => c.id === cat.id ? updated : c))
        setActiveTab(newCategory)
        setConvertTarget(null)
      } else {
        const data = await res.json().catch(() => ({}))
        setConvertError(data.error || 'Failed to convert category')
      }
    } catch {
      setConvertError('Failed to convert category')
    } finally {
      setIsConverting(false)
    }
  }

  const handleCustomSave = async () => {
    if (!activeProject) return
    if (!customName.trim() || !customUnit.trim() || customOperandA === '' || customOperandB === '') {
      setCustomError('All fields are required')
      return
    }
    setIsSavingCustom(true)
    setCustomError('')
    try {
      const token = await getToken()
      const isEdit = customFormEditId !== null
      const url = isEdit
        ? `${apiUrl}/api/data-categories/custom/${customFormEditId}/`
        : `${apiUrl}/api/data-categories/custom/`
      const body = isEdit
        ? {
            name: customName.trim(),
            unit: customUnit.trim(),
            operand_a_id: customOperandA,
            operator: customOperator,
            operand_b_id: customOperandB,
          }
        : {
            project_id: activeProject.id,
            name: customName.trim(),
            unit: customUnit.trim(),
            operand_a_id: customOperandA,
            operator: customOperator,
            operand_b_id: customOperandB,
          }
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const saved: DataCategory = await res.json()
        setCategories(prev => isEdit
          ? prev.map(c => c.id === saved.id ? saved : c)
          : [...prev, saved]
        )
        resetCustomForm()
      } else {
        const data = await res.json().catch(() => ({}))
        setCustomError(data.error || 'Failed to save')
      }
    } catch {
      setCustomError('Failed to save')
    } finally {
      setIsSavingCustom(false)
    }
  }

  const startEditCustom = (cat: DataCategory) => {
    setCustomFormEditId(cat.id)
    setCustomName(cat.name)
    setCustomUnit(cat.unit)
    setCustomOperandA(cat.formula_operand_a ?? '')
    setCustomOperator(cat.formula_operator ?? '/')
    setCustomOperandB(cat.formula_operand_b ?? '')
    setCustomFormOpen(true)
    setCustomError('')
  }

  const handleDeleteCustom = async (id: number) => {
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/data-categories/custom/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setCategories(prev => prev.filter(c => c.id !== id))
      }
    } catch {
      // silently fail
    }
  }

  const startEdit = (cat: DataCategory) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditUnit(cat.unit)
    setEditDataType(cat.data_type)
  }

  if (!activeProject) {
    return <p className="text-sm text-gray-500">Select a project to manage data categories.</p>
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setIsAdding(false); setEditingId(null); resetCustomForm() }}
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

      {error && <div className="text-red-600 bg-red-50 p-2 rounded mb-4 text-sm">{error}</div>}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-gray-200 rounded h-10" />
          ))}
        </div>
      ) : (
        <>
          {activeTab !== 'custom' && (
            <>
          {/* List */}
          {filtered.length === 0 && !isAdding && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} defined yet.</p>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
              <div className="grid grid-cols-[1fr_120px_120px_96px] gap-0 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                <span>Name</span><span>Unit</span><span>Data Type</span><span />
              </div>
              {filtered.map((cat) => (
                <div
                  key={cat.id}
                  className="grid grid-cols-[1fr_120px_120px_96px] gap-0 px-4 py-2 border-t border-gray-100 items-center"
                >
                  {editingId === cat.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-sm mr-2"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editUnit}
                        onChange={e => setEditUnit(e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-sm mr-2"
                      />
                      <div className="relative group mr-2">
                        <select
                          value={editDataType}
                          onChange={e => setEditDataType(e.target.value as DataType)}
                          className="border border-gray-200 rounded px-2 py-1 text-sm bg-white"
                        >
                          {DATA_TYPE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-0 mb-2 w-[260px] rounded-md bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50"
                        >
                          {DATA_TYPE_DESCRIPTIONS[editDataType]}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleSaveClick(cat.id)}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                      <span className="text-sm text-gray-500">{cat.unit}</span>
                      <span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${dataTypeBadgeClass(cat.data_type)}`}>
                          {dataTypeLabel(cat.data_type)}
                        </span>
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(cat)}
                          className="text-gray-400 hover:text-[#eb5234]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          data-convert-trigger
                          onClick={() => setConvertPopoverId(convertPopoverId === cat.id ? null : cat.id)}
                          className="text-gray-400 hover:text-[#eb5234]"
                          title="Convert to another category type"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setDeleteTarget(cat); setDeleteConfirmText('') }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inline add form */}
          {isAdding && (
            <div className="border border-gray-200 rounded-lg p-4 mb-3">
              {addError && (
                <div className="text-red-600 bg-red-50 p-2 rounded mb-3 text-sm">{addError}</div>
              )}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="e.g. CBDa"
                    className={inputClass}
                    autoFocus
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={addUnit}
                    onChange={e => setAddUnit(e.target.value)}
                    placeholder="mg/L"
                    className={inputClass}
                  />
                </div>
                <div className="w-36">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data Type</label>
                  <div className="relative group">
                    <select
                      value={addDataType}
                      onChange={e => setAddDataType(e.target.value as DataType)}
                      className={inputClass}
                    >
                      {DATA_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-0 mb-2 w-[260px] rounded-md bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50"
                    >
                      {DATA_TYPE_DESCRIPTIONS[addDataType]}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={isSaving}
                  className="h-9 px-4 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-all"
                  style={{ backgroundColor: '#eb5234' }}
                >
                  {isSaving ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => { setIsAdding(false); setAddName(''); setAddUnit('mg/L'); setAddDataType('discrete'); setAddError('') }}
                  className="h-9 px-3 text-sm text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add button */}
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1"
            >
              <Plus className="h-4 w-4" /> Add {TABS.find(t => t.key === activeTab)?.label.replace(/s$/, '')}
            </button>
          )}
            </>
          )}

          {activeTab === 'custom' && (
            <>
              {/* Custom rows list */}
              {filtered.length === 0 && !customFormOpen && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">No custom data categories defined yet.</p>
                </div>
              )}

              {filtered.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                  <div className="grid grid-cols-[1fr_240px_120px_96px] gap-0 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                    <span>Name</span><span>Formula</span><span>Unit</span><span />
                  </div>
                  {filtered.map(cat => {
                    const opA = categories.find(c => c.id === cat.formula_operand_a)
                    const opB = categories.find(c => c.id === cat.formula_operand_b)
                    const formula = opA && opB && cat.formula_operator
                      ? `${opA.name} ${OPERATOR_LABELS[cat.formula_operator]} ${opB.name}`
                      : '—'
                    return (
                      <div
                        key={cat.id}
                        className="grid grid-cols-[1fr_240px_120px_96px] gap-0 px-4 py-2 border-t border-gray-100 items-center"
                      >
                        <span className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          {cat.name}
                          {cat.is_stale && (
                            <span
                              title="recomputing…"
                              className="inline-block w-2 h-2 rounded-full bg-gray-400"
                            />
                          )}
                        </span>
                        <span className="text-sm text-gray-700 truncate">{formula}</span>
                        <span className="text-sm text-gray-500">{cat.unit}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditCustom(cat)}
                            className="text-gray-400 hover:text-[#eb5234]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(cat); setDeleteConfirmText('') }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Custom create/edit form */}
              {customFormOpen && (
                <div className="border border-gray-200 rounded-lg p-4 mb-3 space-y-3">
                  {customError && (
                    <div className="text-red-600 bg-red-50 p-2 rounded text-sm">{customError}</div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder="e.g. CBDa per Olivetol"
                      className={inputClass}
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Operand A</label>
                      <select
                        value={customOperandA}
                        onChange={e => setCustomOperandA(e.target.value === '' ? '' : Number(e.target.value))}
                        className={inputClass}
                      >
                        <option value="">Select...</option>
                        {(['product', 'secondary_product', 'process_data'] as const).map(group => {
                          const items = categories.filter(c => c.category === group)
                          if (items.length === 0) return null
                          const groupLabel = TABS.find(t => t.key === group)?.label ?? group
                          return (
                            <optgroup key={group} label={groupLabel}>
                              {items.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Op</label>
                      <div className="flex gap-1">
                        {(['+', '-', '*', '/'] as const).map(op => (
                          <button
                            key={op}
                            type="button"
                            onClick={() => setCustomOperator(op)}
                            className={`h-9 w-9 text-sm border rounded-md ${
                              customOperator === op
                                ? 'border-[#eb5234] text-[#eb5234] bg-orange-50'
                                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {OPERATOR_LABELS[op]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Operand B</label>
                      <select
                        value={customOperandB}
                        onChange={e => setCustomOperandB(e.target.value === '' ? '' : Number(e.target.value))}
                        className={inputClass}
                      >
                        <option value="">Select...</option>
                        {(['product', 'secondary_product', 'process_data'] as const).map(group => {
                          const items = categories.filter(c => c.category === group)
                          if (items.length === 0) return null
                          const groupLabel = TABS.find(t => t.key === group)?.label ?? group
                          return (
                            <optgroup key={group} label={groupLabel}>
                              {items.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <input
                      type="text"
                      value={customUnit}
                      onChange={e => setCustomUnit(e.target.value)}
                      placeholder="e.g. ratio, %, g/g"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCustomSave}
                      disabled={isSavingCustom}
                      className="h-9 px-4 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-all"
                      style={{ backgroundColor: '#eb5234' }}
                    >
                      {isSavingCustom ? 'Saving...' : (customFormEditId !== null ? 'Save' : 'Add')}
                    </button>
                    <button
                      onClick={resetCustomForm}
                      className="h-9 px-3 text-sm text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!customFormOpen && (
                <button
                  onClick={() => { resetCustomForm(); setCustomFormOpen(true) }}
                  className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Add Custom Category
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* Data-type change confirmation */}
      {dataTypeChangeConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Change data type?</h3>
            <p className="text-sm text-gray-600 mb-4">
              You&rsquo;re changing this category from{' '}
              <span className="font-medium">{dataTypeLabel(dataTypeChangeConfirm.oldType)}</span>{' '}
              to{' '}
              <span className="font-medium">{dataTypeLabel(dataTypeChangeConfirm.newType)}</span>.
              All existing data points attached to this category will be updated.
              Data recorded under the old type may not display correctly under the new one
              (for example, a multi-row series switched to <span className="font-medium">Point</span>{' '}
              will only show its first value).
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDataTypeChangeConfirm(null)}
                className="flex-1 h-9 text-sm font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = dataTypeChangeConfirm.id
                  setDataTypeChangeConfirm(null)
                  await handleUpdate(id)
                }}
                className="flex-1 h-9 text-sm font-medium text-white rounded-md hover:opacity-90 transition-all"
                style={{ backgroundColor: '#eb5234' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert picker modal — choose target category type */}
      {convertPopoverId !== null && (() => {
        const cat = categories.find(c => c.id === convertPopoverId)
        if (!cat) return null
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
            <div data-convert-popover className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Convert data category</h3>
              <p className="text-sm text-gray-600 mb-4">
                Convert <span className="font-medium">{cat.name}</span> from{' '}
                <span className="font-medium">{TABS.find(t => t.key === cat.category)?.label.replace(/s$/, '')}</span>{' '}
                to which type?
              </p>
              <div className="flex flex-col gap-2">
                {TABS.filter(t => t.key !== cat.category && t.key !== 'custom').map(t => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setConvertPopoverId(null)
                      setConvertTarget({ cat, newCategory: t.key })
                      setConvertError('')
                    }}
                    className="w-full text-left px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-2"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 text-gray-400" />
                    {t.label.replace(/s$/, '')}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setConvertPopoverId(null)}
                className="w-full mt-4 h-9 text-sm font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )
      })()}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Data Category</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <span className="font-medium">{deleteTarget.name}</span>? This action cannot be undone.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type <span className="font-semibold">delete</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              className={inputClass}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={async () => {
                  if (deleteTarget.category === 'custom') {
                    await handleDeleteCustom(deleteTarget.id)
                  } else {
                    await handleDelete(deleteTarget.id)
                  }
                  setDeleteTarget(null)
                  setDeleteConfirmText('')
                }}
                disabled={deleteConfirmText !== 'delete'}
                className="flex-1 h-9 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText('') }}
                className="flex-1 h-9 text-sm font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Convert confirmation modal */}
      {convertTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Convert data category?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Convert <span className="font-medium">{convertTarget.cat.name}</span> from{' '}
              <span className="font-medium">{TABS.find(t => t.key === convertTarget.cat.category)?.label.replace(/s$/, '')}</span>{' '}
              to{' '}
              <span className="font-medium">{TABS.find(t => t.key === convertTarget.newCategory)?.label.replace(/s$/, '')}</span>?
              {' '}This will move all data points attached to this category to the new type.
              Charts and filters will reflect the change immediately.
            </p>
            {convertError && (
              <div className="text-red-600 bg-red-50 p-2 rounded mb-3 text-sm">{convertError}</div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setConvertTarget(null); setConvertError('') }}
                disabled={isConverting}
                className="flex-1 h-9 text-sm font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConvert(convertTarget.cat, convertTarget.newCategory)}
                disabled={isConverting}
                className="flex-1 h-9 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-all"
                style={{ backgroundColor: '#eb5234' }}
              >
                {isConverting ? 'Converting...' : 'Convert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DataCategoryManager
