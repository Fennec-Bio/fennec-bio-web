'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

interface StrainLineageData {
  name: string
  parent: string | null
  experiment_count: number
  max_titers: Record<string, number>
  modifications: {
    id: number
    modification_type: string
    gene_name: string
  }[]
  description?: string
  species?: string | null
  notes?: string
  isolate?: string | null
  lineage_id: number | null
}

interface StrainOption {
  name: string
  experiment_count: number
}

interface Modification {
  id: number | null
  modification_type: string
  gene_name: string
  isNew?: boolean
}

interface EditStrainProps {
  strainName: string
  strainData: StrainLineageData | null
  onStrainUpdated: () => void
  onStrainDeleted?: () => void
  availableStrains: StrainOption[]
}

export function EditStrain({ strainName, strainData, onStrainUpdated, onStrainDeleted, availableStrains }: EditStrainProps) {
  const { getToken } = useAuth()

  const [parent, setParent] = useState('')
  const [species, setSpecies] = useState('')
  const [isolate, setIsolate] = useState('')
  const [description, setDescription] = useState('')
  const [modifications, setModifications] = useState<Modification[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const experimentCount = strainData?.experiment_count ?? 0

  // Populate form from strainData
  useEffect(() => {
    if (strainData) {
      setParent(strainData.parent || '')
      // A strain with a parent inherits its species — don't surface a stale value
      // that's hidden from the UI but would get submitted on save.
      setSpecies(strainData.parent ? '' : (strainData.species || ''))
      setIsolate(strainData.isolate || '')
      setDescription(strainData.description || '')
      setModifications(
        strainData.modifications.map(m => ({
          id: m.id,
          modification_type: m.modification_type,
          gene_name: m.gene_name,
          isNew: false,
        }))
      )
    } else {
      setParent('')
      setSpecies('')
      setIsolate('')
      setDescription('')
      setModifications([])
    }
    setSuccessMessage('')
    setErrorMessage('')
  }, [strainData, strainName])

  const handleParentChange = (parentName: string) => {
    setParent(parentName)
    if (parentName) setSpecies('')
  }

  const addModification = () => {
    setModifications(prev => [...prev, { id: null, modification_type: 'insertion', gene_name: '', isNew: true }])
  }

  const removeModification = (index: number) => {
    setModifications(prev => prev.filter((_, i) => i !== index))
  }

  const updateModification = (index: number, field: keyof Omit<Modification, 'id' | 'isNew'>, value: string) => {
    setModifications(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage('')
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const token = await getToken()
      const payload: Record<string, unknown> = {
        parent_strain: parent || null,
        species: species.trim() || null,
        isolate: isolate.trim() || null,
        description: description.trim(),
        modifications: modifications
          .filter(m => m.gene_name.trim())
          .map(m => ({
            type: m.modification_type,
            gene_name: m.gene_name.trim(),
          })),
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/strain-lineage/${encodeURIComponent(strainName)}/`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || data?.detail || 'Failed to update strain')
      }

      setSuccessMessage('Strain updated successfully')
      onStrainUpdated()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update strain')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setErrorMessage('')
    setIsDeleting(true)
    try {
      const token = await getToken()
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/strain-lineage/${encodeURIComponent(strainName)}/`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || data?.detail || 'Failed to delete strain')
      }
      setShowDeleteConfirm(false)
      onStrainDeleted?.()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete strain')
    } finally {
      setIsDeleting(false)
    }
  }

  if (!strainData) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Strain</h3>
        <div className="text-center py-8 text-gray-500">
          No lineage record found for this strain. Use &quot;Add Strain&quot; to create one.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Strain</h3>

      {successMessage && (
        <div className="mb-4 p-2 bg-green-50 text-green-600 rounded text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 p-2 bg-red-50 text-red-600 rounded text-sm">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Strain name (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Strain Name
          </label>
          <input
            type="text"
            value={strainName}
            disabled
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
          />
        </div>

        {/* Parent strain */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Parent Strain
          </label>
          <select
            value={parent}
            onChange={e => handleParentChange(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None (root strain)</option>
            {availableStrains
              .filter(s => s.name !== strainName)
              .map(s => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
          </select>
        </div>

        {/* Metadata */}
        <div className={`grid grid-cols-1 ${parent ? '' : 'md:grid-cols-2'} gap-3`}>
          {!parent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Species
              </label>
              <input
                type="text"
                value={species}
                onChange={e => setSpecies(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Isolate
            </label>
            <input
              type="text"
              value={isolate}
              onChange={e => setIsolate(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Modifications */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Modifications
          </label>
          {modifications.length === 0 && (
            <p className="text-sm text-gray-500 mb-2">No modifications.</p>
          )}
          <div className="space-y-3">
            {modifications.map((mod, index) => (
              <div key={index} className="flex gap-2 items-start">
                <select
                  value={mod.modification_type}
                  onChange={e => updateModification(index, 'modification_type', e.target.value)}
                  className="border border-gray-200 rounded-md px-2 py-2 text-sm min-w-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="insertion">Insertion</option>
                  <option value="deletion">Deletion</option>
                  <option value="modification">Modification</option>
                  <option value="plasmid">Plasmid</option>
                </select>
                <input
                  type="text"
                  value={mod.gene_name}
                  onChange={e => updateModification(index, 'gene_name', e.target.value)}
                  placeholder="Gene name"
                  className="flex-1 border border-gray-200 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/* Badge */}
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  mod.isNew ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {mod.isNew ? 'New' : 'Saved'}
                </span>
                <button
                  type="button"
                  onClick={() => removeModification(index)}
                  className="h-9 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addModification}
            className="mt-2 h-8 px-3 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
          >
            + Add Modification
          </button>
        </div>

        {/* Submit + Delete */}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting || isDeleting}
            className="flex-1 h-10 px-4 rounded-md text-sm font-medium text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
            style={{ backgroundColor: '#eb5234' }}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isSubmitting || isDeleting}
            className="h-10 px-3 border border-red-200 text-red-600 rounded-md text-sm font-medium hover:bg-red-50 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            Delete
          </button>
        </div>
      </form>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!isDeleting) setShowDeleteConfirm(false) }}
          />
          <div className="relative bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Strain</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-medium">{strainName}</span>?
              {' '}Deleting this strain will delete all data associated with it
              {experimentCount > 0 && <> (including {experimentCount} experiment{experimentCount === 1 ? '' : 's'})</>}
              . This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditStrain
