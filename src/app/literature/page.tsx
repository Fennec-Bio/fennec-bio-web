'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { FileText, Link as LinkIcon, Pencil, Trash2, Plus, Upload, X } from 'lucide-react'

interface LiteratureEntry {
  id: number
  title: string
  url: string
  has_file: boolean
  file_url: string | null
  created_at: string
}

// --- Upload Modal ---

function UploadModal({ isOpen, onClose, onComplete, projectId }: {
  isOpen: boolean; onClose: () => void; onComplete: () => void; projectId?: number | null
}) {
  const { getToken } = useAuth()
  const [mode, setMode] = useState<'pdf' | 'url'>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const reset = () => {
    setFile(null); setTitle(''); setUrl(''); setError(''); setMode('pdf')
  }

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) { setError('Only PDF files'); return }
    setFile(f)
    if (!title) setTitle(f.name.replace('.pdf', ''))
    setError('')
  }

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    if (mode === 'pdf' && !file) { setError('Select a PDF file'); return }
    if (mode === 'url' && !url.trim()) { setError('Enter a URL'); return }

    setSubmitting(true); setError('')
    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('title', title.trim())
      if (mode === 'pdf' && file) formData.append('file', file)
      if (mode === 'url') formData.append('url', url.trim())
      if (projectId) formData.append('project_id', String(projectId))

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/literature/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to add paper')
      }
      onComplete()
      reset(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add paper')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Add Paper</h2>
          <button onClick={() => { reset(); onClose() }} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          {(['pdf', 'url'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-[#eb5234] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {m === 'pdf' ? <FileText className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
              {m === 'pdf' ? 'Upload PDF' : 'Add URL'}
            </button>
          ))}
        </div>

        {mode === 'pdf' && (
          <div
            onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-[#eb5234] transition-colors mb-4"
          >
            <input ref={fileRef} type="file" accept=".pdf" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} className="hidden" />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-[#eb5234]">
                <FileText className="h-6 w-6" /><span className="font-medium">{file.name}</span>
              </div>
            ) : (
              <><Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" /><p className="text-gray-600">Drop PDF here or click to select</p></>
            )}
          </div>
        )}

        {mode === 'url' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
              type="url" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Paper title"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={() => { reset(); onClose() }} disabled={submitting}
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="h-9 px-4 py-2 rounded-md text-sm font-medium text-white shadow-xs transition-all disabled:opacity-50"
            style={{ backgroundColor: '#eb5234' }}>
            {submitting ? 'Adding...' : 'Add Paper'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Edit Modal ---

function EditModal({ entry, onClose, onSave }: {
  entry: LiteratureEntry | null; onClose: () => void; onSave: () => void
}) {
  const { getToken } = useAuth()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (entry) { setTitle(entry.title); setUrl(entry.url); setError('') }
  }, [entry])

  if (!entry) return null

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true); setError('')
    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/literature/${entry.id}/`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), url: url.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to update')
      }
      onSave(); onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Edit Paper</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} type="url"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting}
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="h-9 px-4 py-2 rounded-md text-sm font-medium text-white shadow-xs transition-all disabled:opacity-50"
            style={{ backgroundColor: '#eb5234' }}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Main Page ---

export default function LiteraturePage() {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const [entries, setEntries] = useState<LiteratureEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LiteratureEntry | null>(null)

  const fetchEntries = useCallback(async (search?: string) => {
    setLoading(true)
    try {
      const token = await getToken()
      const params = new URLSearchParams()
      if (search?.trim()) params.set('search', search.trim())
      if (activeProject) params.set('project_id', activeProject.id.toString())
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/literature/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
      }
    } catch (err) {
      console.error('Error fetching literature:', err)
    } finally {
      setLoading(false)
    }
  }, [getToken, activeProject])

  // Debounced search
  const debounceRef = useRef<NodeJS.Timeout>(null)
  useEffect(() => {
    debounceRef.current = setTimeout(() => fetchEntries(searchText), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [fetchEntries, searchText])

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this paper? This cannot be undone.')) return
    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/literature/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) fetchEntries(searchText)
    } catch (err) {
      console.error('Error deleting:', err)
    }
  }

  const openEntry = (entry: LiteratureEntry) => {
    const target = entry.has_file && entry.file_url ? entry.file_url : entry.url
    if (target) window.open(target, '_blank')
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Literature</h1>
          {activeProject ? (
            <button onClick={() => setUploadOpen(true)}
              className="flex items-center gap-2 h-9 px-4 py-2 rounded-md text-sm font-medium text-white shadow-xs transition-all"
              style={{ backgroundColor: '#eb5234' }}>
              <Plus className="h-4 w-4" /> Add Paper
            </button>
          ) : (
            <span className="text-sm text-gray-400">Select a project to add papers</span>
          )}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <input
            type="text"
            placeholder="Search by title..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-lg">No papers yet</p>
            <p className="text-gray-400 text-sm mt-1">Click &quot;Add Paper&quot; to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {entries.map(entry => (
              <div key={entry.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <button onClick={() => openEntry(entry)}
                    className="text-left font-semibold text-gray-900 hover:text-[#eb5234] transition-colors line-clamp-2 flex-1">
                    {entry.title}
                  </button>
                  <div className="flex-shrink-0" title={entry.has_file ? 'PDF' : 'URL'}>
                    {entry.has_file
                      ? <FileText className="h-4 w-4 text-red-500" />
                      : <LinkIcon className="h-4 w-4 text-blue-500" />}
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-auto">
                  Added {new Date(entry.created_at).toLocaleDateString()}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100 flex justify-end gap-2">
                  <button onClick={() => setEditingEntry(entry)} className="text-gray-400 hover:text-blue-500 transition-colors" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onComplete={() => fetchEntries(searchText)} projectId={activeProject?.id} />
      <EditModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSave={() => fetchEntries(searchText)} />
    </div>
  )
}
