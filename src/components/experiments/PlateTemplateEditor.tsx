'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useDataCategories } from '@/hooks/useDataCategories'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type PlateConfig = {
  variable_names: string[]
  measurement_data_category_ids: number[]
  default_format: '96' | '384'
}

type PlateTemplate = {
  id: number
  name: string
  project: number
  template_type: 'plate'
  plate_config: PlateConfig
  created_at: string
  updated_at: string
}

const API = process.env.NEXT_PUBLIC_API_URL

export function PlateTemplateEditor() {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const projectId = activeProject?.id ?? null
  const { categories } = useDataCategories(projectId)
  const allowedCats = categories.filter(c => c.category !== 'process_data')

  const [templates, setTemplates] = useState<PlateTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [format, setFormat] = useState<'96' | '384'>('96')
  const [variableNames, setVariableNames] = useState<string[]>([])
  const [measurementIds, setMeasurementIds] = useState<number[]>([])
  const [newVar, setNewVar] = useState('')

  const fetchTemplates = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const resp = await fetch(
        `${API}/api/data-templates/?type=plate&project_id=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setTemplates(await resp.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, getToken])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  function resetForm() {
    setEditingId(null)
    setName('')
    setFormat('96')
    setVariableNames(['Strain', 'Media'])
    setMeasurementIds([])
    setNewVar('')
    setError(null)
  }

  function startCreate() {
    resetForm()
    setMode('edit')
  }

  function startEdit(t: PlateTemplate) {
    setEditingId(t.id)
    setName(t.name)
    setFormat(t.plate_config?.default_format ?? '96')
    setVariableNames(t.plate_config?.variable_names ?? [])
    setMeasurementIds(t.plate_config?.measurement_data_category_ids ?? [])
    setNewVar('')
    setError(null)
    setMode('edit')
  }

  function addVariable() {
    const v = newVar.trim()
    if (!v) return
    if (variableNames.includes(v)) {
      setError(`Variable "${v}" already in this template.`)
      return
    }
    const measNames = new Set(
      measurementIds
        .map(id => allowedCats.find(c => c.id === id)?.name)
        .filter((n): n is string => !!n),
    )
    if (measNames.has(v)) {
      setError(`"${v}" collides with a measurement name.`)
      return
    }
    setVariableNames(prev => [...prev, v])
    setNewVar('')
    setError(null)
  }

  async function save() {
    if (!projectId || !name.trim()) return
    // Symmetric collision check: variable names and measurement column names
    // share the same column namespace in the wizard's table, so duplicates
    // would produce confusing two-of-a-kind columns. addVariable() covers the
    // variable-add path; this covers the measurement-toggle path.
    const measNames = new Set(
      measurementIds
        .map(id => allowedCats.find(c => c.id === id)?.name)
        .filter((n): n is string => !!n),
    )
    const collision = variableNames.find(v => measNames.has(v))
    if (collision) {
      setError(`Variable "${collision}" collides with a selected measurement name.`)
      return
    }
    setError(null)
    const payload = {
      name: name.trim(),
      project_id: projectId,
      template_type: 'plate',
      plate_config: {
        variable_names: variableNames,
        measurement_data_category_ids: measurementIds,
        default_format: format,
      },
    }
    try {
      const token = await getToken()
      const url = editingId
        ? `${API}/api/data-templates/${editingId}/`
        : `${API}/api/data-templates/`
      const method = editingId ? 'PUT' : 'POST'
      const resp = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? JSON.stringify(body))
      }
      await fetchTemplates()
      setMode('list')
      resetForm()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete this plate template?')) return
    try {
      const token = await getToken()
      const resp = await fetch(`${API}/api/data-templates/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      fetchTemplates()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (mode === 'edit') {
    return (
      <div>
        <button
          type="button"
          onClick={() => { setMode('list'); resetForm() }}
          className="mb-3 text-sm text-gray-500 hover:text-gray-900"
        >
          ← Back to list
        </button>
        <h3 className="text-lg font-semibold mb-4">
          {editingId ? 'Edit plate template' : 'New plate template'}
        </h3>
        {error && <div className="rounded bg-red-50 p-2 text-sm text-red-600 mb-3">{error}</div>}
        <div className="space-y-4">
          <div>
            <label htmlFor="ptpl-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="ptpl-name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
            />
          </div>
          <div>
            <label htmlFor="ptpl-format" className="block text-sm font-medium text-gray-700 mb-1">Default plate format</label>
            <select
              id="ptpl-format"
              value={format}
              onChange={e => setFormat(e.target.value as '96' | '384')}
              className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
            >
              <option value="96">96-well</option>
              <option value="384">384-well</option>
            </select>
          </div>
          <div>
            <div className="block text-sm font-medium text-gray-700 mb-1">Preview</div>
            <div className="text-xs text-gray-500 mb-2">First 2 wells of a {format}-well plate</div>
            <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
              <table className="border-collapse text-xs w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left text-gray-500 font-medium border-b border-gray-200 w-16">Well</th>
                    {variableNames.map(name => (
                      <th key={`pv-v-${name}`} className="px-2 py-2 text-left text-gray-500 font-medium border-b border-gray-200">
                        {name}
                      </th>
                    ))}
                    {measurementIds.map(id => {
                      const cat = allowedCats.find(c => c.id === id)
                      if (!cat) return null
                      return (
                        <th key={`pv-m-${id}`} className="px-2 py-2 text-left text-gray-500 font-medium border-b border-gray-200">
                          {cat.name}{cat.unit ? ` (${cat.unit})` : ''}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {['A1', 'A2'].map(wk => (
                    <tr key={`pv-row-${wk}`} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-700 font-medium">{wk}</td>
                      {variableNames.map(name => (
                        <td key={`pv-cv-${name}-${wk}`} className="px-2 py-1 text-gray-400">—</td>
                      ))}
                      {measurementIds.map(id => (
                        <td key={`pv-cm-${id}-${wk}`} className="px-2 py-1 text-gray-400">—</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="block text-sm font-medium text-gray-700 mb-1">Variables</div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {variableNames.length === 0 && (
                <span className="text-xs text-gray-400">No variables yet.</span>
              )}
              {variableNames.map(v => (
                <span key={v} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">
                  {v}
                  <button
                    type="button"
                    onClick={() => {
                      if (v.toLowerCase() === 'strain' || v.toLowerCase() === 'media') {
                        window.alert('The Strain and Media variables cannot be removed.')
                        return
                      }
                      setVariableNames(prev => prev.filter(x => x !== v))
                    }}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`Remove variable ${v}`}
                  >×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newVar}
                onChange={e => setNewVar(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariable() } }}
                placeholder="Variable name (e.g. strain)"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
              />
              <button
                type="button"
                onClick={addVariable}
                disabled={!newVar.trim()}
                className="px-3 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
          <div>
            <div className="block text-sm font-medium text-gray-700 mb-1">Measurements</div>
            {allowedCats.length === 0 ? (
              <div className="text-xs text-gray-500">No non-process-data measurements available for this project.</div>
            ) : (
              <ul className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
                {allowedCats.map(c => {
                  const checked = measurementIds.includes(c.id)
                  return (
                    <li key={c.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setMeasurementIds(prev =>
                            checked ? prev.filter(id => id !== c.id) : [...prev, c.id],
                          )}
                        />
                        <span>{c.name}{c.unit ? ` (${c.unit})` : ''}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!name.trim() || !projectId}
              className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
            >
              {editingId ? 'Save changes' : 'Create template'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('list'); resetForm() }}
              className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Plate Templates</h3>
        <button
          type="button"
          onClick={startCreate}
          disabled={!projectId}
          className="h-9 px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] transition-all flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New Plate Template
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
          <p className="text-sm">No plate templates yet for this project.</p>
          <p className="text-xs mt-1">Create a template to pre-configure variable and measurement columns for the plate wizard.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {templates.map((t, i) => {
            const cfg = t.plate_config ?? { variable_names: [], measurement_data_category_ids: [], default_format: '96' }
            return (
              <div
                key={t.id}
                className={`px-4 py-3 flex items-center justify-between ${i < templates.length - 1 ? 'border-b border-gray-200' : ''}`}
              >
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-gray-500">
                    {cfg.default_format}-well · {cfg.variable_names.length} variable{cfg.variable_names.length !== 1 ? 's' : ''} · {cfg.measurement_data_category_ids.length} measurement{cfg.measurement_data_category_ids.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="text-[#eb5234] hover:text-[#d4492f] text-sm flex items-center gap-1"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="text-gray-400 hover:text-red-500 text-sm flex items-center gap-1"
                  >
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
