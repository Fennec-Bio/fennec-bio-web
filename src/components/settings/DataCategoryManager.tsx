'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { Plus, Pencil, Trash2, X, Check, ArrowRightLeft } from 'lucide-react'

interface DataCategory {
  id: number
  project: number
  category: 'product' | 'secondary_product' | 'process_data'
  name: string
  unit: string
}

type CategoryTab = 'product' | 'secondary_product' | 'process_data'

const TABS: { key: CategoryTab; label: string }[] = [
  { key: 'product', label: 'Products' },
  { key: 'secondary_product', label: 'Secondary Products' },
  { key: 'process_data', label: 'Process Data' },
]

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
  const [addError, setAddError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState('')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<DataCategory | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Convert popover + modal state
  const [convertPopoverId, setConvertPopoverId] = useState<number | null>(null)
  const [convertTarget, setConvertTarget] = useState<{ cat: DataCategory; newCategory: CategoryTab } | null>(null)
  const [convertError, setConvertError] = useState('')
  const [isConverting, setIsConverting] = useState(false)

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
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setCategories(prev => [...prev, created])
        setAddName('')
        setAddUnit('mg/L')
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

  const startEdit = (cat: DataCategory) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditUnit(cat.unit)
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
            onClick={() => { setActiveTab(key); setIsAdding(false); setEditingId(null) }}
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
          {/* List */}
          {filtered.length === 0 && !isAdding && (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No {TABS.find(t => t.key === activeTab)?.label.toLowerCase()} defined yet.</p>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
              <div className="grid grid-cols-[1fr_120px_96px] gap-0 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                <span>Name</span><span>Unit</span><span />
              </div>
              {filtered.map((cat) => (
                <div
                  key={cat.id}
                  className="grid grid-cols-[1fr_120px_96px] gap-0 px-4 py-2 border-t border-gray-100 items-center"
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
                        className="border border-gray-200 rounded px-2 py-1 text-sm"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdate(cat.id)}
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
                      <div className="flex items-center gap-1 relative">
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

                        {convertPopoverId === cat.id && (
                          <div
                            data-convert-popover
                            className="absolute right-0 top-7 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
                          >
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
                              Convert &ldquo;{cat.name}&rdquo; to:
                            </div>
                            {TABS.filter(t => t.key !== cat.category).map(t => (
                              <button
                                key={t.key}
                                onClick={() => {
                                  setConvertPopoverId(null)
                                  setConvertTarget({ cat, newCategory: t.key })
                                  setConvertError('')
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5 text-gray-400" />
                                {t.label.replace(/s$/, '')}
                              </button>
                            ))}
                          </div>
                        )}
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
                <button
                  onClick={handleAdd}
                  disabled={isSaving}
                  className="h-9 px-4 text-sm font-medium text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-all"
                  style={{ backgroundColor: '#eb5234' }}
                >
                  {isSaving ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => { setIsAdding(false); setAddName(''); setAddUnit('mg/L'); setAddError('') }}
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
                  await handleDelete(deleteTarget.id)
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
                className="flex-1 h-9 text-sm font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-all"
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
