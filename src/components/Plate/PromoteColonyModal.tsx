'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'

export function PromoteColonyModal({
  parentStrain, parentColony, projectId, onClose, onPromoted,
}: {
  parentStrain: string
  parentColony: string
  projectId: number
  onClose: () => void
  onPromoted: () => void
}) {
  const { getToken } = useAuth()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await getToken()
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/strain-lineage/create/`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strain_name: name.trim(),
            parent_strain: parentStrain,
            parent_colony: parentColony,
            project_id: projectId,
          }),
        },
      )
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${resp.status}`)
      }
      onPromoted()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-lg shadow-lg p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 text-lg font-bold text-gray-900">Promote colony to strain</div>
        <div className="mb-3 space-y-1 text-sm text-gray-700">
          <div><span className="font-medium">Parent strain:</span> {parentStrain}</div>
          <div><span className="font-medium">Parent colony:</span> {parentColony}</div>
        </div>
        <div className="mb-3">
          <label htmlFor="newName" className="block text-sm font-medium text-gray-700 mb-1">
            New strain name
          </label>
          <input
            id="newName"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
          />
        </div>
        {error && <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
          >
            {submitting ? 'Promoting…' : 'Promote'}
          </button>
        </div>
      </div>
    </div>
  )
}
