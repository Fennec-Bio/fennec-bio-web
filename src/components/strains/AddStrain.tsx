'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

interface Modification {
  modification_type: string
  gene_name: string
}

interface StrainOption {
  name: string
  experiment_count: number
}

interface AddStrainProps {
  onStrainAdded: () => void
}

export function AddStrain({ onStrainAdded }: AddStrainProps) {
  const { getToken } = useAuth()

  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [modifications, setModifications] = useState<Modification[]>([])
  const [availableStrains, setAvailableStrains] = useState<StrainOption[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const isFetchingRef = useRef(false)

  useEffect(() => {
    fetchAvailableStrains()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchAvailableStrains = async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const token = await getToken()
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/strains/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setAvailableStrains(data.strains || [])
      }
    } catch (err) {
      console.error('Error fetching strains for parent selector:', err)
    } finally {
      isFetchingRef.current = false
    }
  }

  const addModification = () => {
    setModifications(prev => [...prev, { modification_type: 'insertion', gene_name: '' }])
  }

  const removeModification = (index: number) => {
    setModifications(prev => prev.filter((_, i) => i !== index))
  }

  const updateModification = (index: number, field: keyof Modification, value: string) => {
    setModifications(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage('')
    setErrorMessage('')

    if (!name.trim()) {
      setErrorMessage('Strain name is required')
      return
    }

    setIsSubmitting(true)
    try {
      const token = await getToken()
      const payload: Record<string, unknown> = {
        strain_name: name.trim(),
        parent_strain: parent || null,
        modifications: modifications
          .filter(m => m.gene_name.trim())
          .map(m => ({ type: m.modification_type, gene_name: m.gene_name.trim() })),
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/strain-lineage/create/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || data?.detail || 'Failed to create strain')
      }

      setSuccessMessage(`Strain "${name.trim()}" created successfully`)
      setName('')
      setParent('')
      setModifications([])
      onStrainAdded()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create strain')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Strain</h3>

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
        {/* Strain name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Strain Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. BY4741-CbGAS"
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Parent strain */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Parent Strain
          </label>
          <select
            value={parent}
            onChange={e => setParent(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None (root strain)</option>
            {availableStrains.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Modifications */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Modifications
          </label>
          {modifications.length === 0 && (
            <p className="text-sm text-gray-500 mb-2">No modifications added yet.</p>
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
                </select>
                <input
                  type="text"
                  value={mod.gene_name}
                  onChange={e => updateModification(index, 'gene_name', e.target.value)}
                  placeholder="Gene name"
                  className="flex-1 border border-gray-200 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-10 px-4 rounded-md text-sm font-medium text-white shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
          style={{ backgroundColor: '#eb5234' }}
        >
          {isSubmitting ? 'Creating...' : 'Create Strain'}
        </button>
      </form>
    </div>
  )
}

export default AddStrain
