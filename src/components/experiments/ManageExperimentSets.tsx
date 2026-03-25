'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'

interface ExperimentOption {
  id: number
  title: string
}

interface ExperimentSetData {
  id: string
  name: string
  hypothesis: string
  conclusion: string
  exp_summary: string
  experiments: ExperimentOption[]
  created_at: string
}

interface ManageExperimentSetsProps {
  externalSelectedSetId?: string | null
}

export function ManageExperimentSets({ externalSelectedSetId }: ManageExperimentSetsProps = {}) {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()

  const [sets, setSets] = useState<ExperimentSetData[]>([])
  const [experiments, setExperiments] = useState<ExperimentOption[]>([])
  const [selectedSetId, setSelectedSetId] = useState<string>('new')
  const [name, setName] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [selectedExpIds, setSelectedExpIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  const fetchSets = useCallback(async () => {
    if (!activeProject) return
    const token = await getToken()
    const res = await fetch(
      `${apiUrl}/api/experiment-sets/?project=${activeProject.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) {
      setSets(await res.json())
    }
  }, [activeProject, apiUrl, getToken])

  const fetchExperiments = useCallback(async () => {
    if (!activeProject) return
    const token = await getToken()
    const res = await fetch(
      `${apiUrl}/api/experimentList/?project=${activeProject.id}&page_size=500`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) {
      const data = await res.json()
      const exps = data.experiments?.experiments || []
      setExperiments(exps.map((e: { id: number; title: string }) => ({ id: e.id, title: e.title })))
    }
  }, [activeProject, apiUrl, getToken])

  useEffect(() => {
    fetchSets()
    fetchExperiments()
  }, [fetchSets, fetchExperiments])

  useEffect(() => {
    if (externalSelectedSetId && sets.some(s => s.id === externalSelectedSetId)) {
      setSelectedSetId(externalSelectedSetId)
    }
  }, [externalSelectedSetId, sets])

  useEffect(() => {
    if (selectedSetId === 'new') {
      setName('')
      setHypothesis('')
      setConclusion('')
      setSelectedExpIds(new Set())
      setError('')
      setSuccess('')
    } else {
      const set = sets.find(s => s.id === selectedSetId)
      if (set) {
        setName(set.name)
        setHypothesis(set.hypothesis || '')
        setConclusion(set.conclusion || '')
        setSelectedExpIds(new Set(set.experiments.map(e => e.id)))
        setError('')
        setSuccess('')
      }
    }
  }, [selectedSetId, sets])

  const toggleExperiment = (id: number) => {
    setSelectedExpIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    if (!name.trim() || !activeProject) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/experiment-sets/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          hypothesis: hypothesis.trim(),
          conclusion: conclusion.trim(),
          project: activeProject.id,
          experiment_ids: Array.from(selectedExpIds),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create set')
        return
      }
      setSuccess('Experiment set created')
      setSelectedSetId('new')
      fetchSets()
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!name.trim() || selectedSetId === 'new') return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/experiment-sets/${selectedSetId}/`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          hypothesis: hypothesis.trim(),
          conclusion: conclusion.trim(),
          experiment_ids: Array.from(selectedExpIds),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to update set')
        return
      }
      setSuccess('Experiment set updated')
      fetchSets()
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (selectedSetId === 'new') return
    if (!confirm('This will remove the set but keep all experiments. Continue?')) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/experiment-sets/${selectedSetId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setError('Failed to delete set')
        return
      }
      setSuccess('Experiment set deleted')
      setSelectedSetId('new')
      fetchSets()
    } finally {
      setLoading(false)
    }
  }

  if (!activeProject) {
    return <p className="text-sm text-gray-500">Select a project to manage experiment sets.</p>
  }

  const isCreateMode = selectedSetId === 'new'
  const canSubmit = name.trim().length > 0 && selectedExpIds.size > 0

  return (
    <div className="space-y-4">
      {/* Dropdown selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Select Set</label>
        <select
          value={selectedSetId}
          onChange={e => setSelectedSetId(e.target.value)}
          className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all w-full"
        >
          <option value="new">Create New Set</option>
          {sets.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Set name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Set Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. FERM 100"
          className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Hypothesis */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Hypothesis</label>
        <textarea
          value={hypothesis}
          onChange={e => setHypothesis(e.target.value)}
          placeholder="What is the hypothesis for this experiment set?"
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      </div>

      {/* Conclusion */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Conclusion</label>
        <textarea
          value={conclusion}
          onChange={e => setConclusion(e.target.value)}
          placeholder="What was the conclusion from this experiment set?"
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      </div>

      {/* Experiment checkboxes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Experiments ({selectedExpIds.size} selected)
        </label>
        <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
          {experiments.length === 0 ? (
            <p className="px-4 py-2 text-sm text-gray-500">No experiments in this project</p>
          ) : (
            experiments.map(exp => (
              <label
                key={exp.id}
                className="flex items-center px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedExpIds.has(exp.id)}
                  onChange={() => toggleExperiment(exp.id)}
                  className="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {exp.title}
              </label>
            ))
          )}
        </div>
      </div>

      {/* Error / success messages */}
      {error && <p className="text-red-600 bg-red-50 p-2 rounded text-sm">{error}</p>}
      {success && <p className="text-green-600 bg-green-50 p-2 rounded text-sm">{success}</p>}

      {/* Action buttons */}
      <div className="flex gap-3">
        {isCreateMode ? (
          <button
            onClick={handleCreate}
            disabled={!canSubmit || loading}
            className="h-9 px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium shadow-xs hover:bg-[#d4472d] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Creating...' : 'Create Set'}
          </button>
        ) : (
          <>
            <button
              onClick={handleUpdate}
              disabled={!canSubmit || loading}
              className="h-9 px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium shadow-xs hover:bg-[#d4472d] transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="h-9 px-4 py-2 border border-red-300 text-red-600 rounded-md text-sm font-medium shadow-xs hover:bg-red-50 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Deleting...' : 'Delete Set'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
