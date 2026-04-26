'use client'

import React, { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import {
  ComplexComponentRow, ComponentRow, MediaFormFields,
  complexRowsToPayload, rowsToPayload,
} from './MediaFormShared'
import { useMediaComponentCatalog } from './useMediaComponentCatalog'

interface CreateMediaProps {
  onCreated?: () => void
  catalogRefreshKey?: number
}

export function CreateMedia({ onCreated, catalogRefreshKey }: CreateMediaProps = {}) {
  const catalog = useMediaComponentCatalog(catalogRefreshKey)
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  const [name, setName] = useState('')
  const [carbonSources, setCarbonSources] = useState<ComponentRow[]>([])
  const [nitrogenSources, setNitrogenSources] = useState<ComponentRow[]>([])
  const [complexComponents, setComplexComponents] = useState<ComplexComponentRow[]>([])
  const [additionalComponents, setAdditionalComponents] = useState<ComponentRow[]>([])

  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const resetForm = () => {
    setName('')
    setCarbonSources([])
    setNitrogenSources([])
    setComplexComponents([])
    setAdditionalComponents([])
  }

  const handleCreate = async () => {
    setErrorMessage('')
    if (!name.trim()) {
      setErrorMessage('Media name is required')
      return
    }

    setIsCreating(true)
    try {
      const token = await getToken()
      const body = {
        name: name.trim(),
        project_id: activeProject?.id,
        carbon_sources: rowsToPayload(carbonSources),
        nitrogen_sources: rowsToPayload(nitrogenSources),
        complex_components: complexRowsToPayload(complexComponents),
        additional_components: rowsToPayload(additionalComponents),
      }

      const res = await fetch(`${apiUrl}/api/media/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Request failed (${res.status})`)
      }

      const created = name.trim()
      resetForm()
      setSuccessMessage(`Media "${created}" created successfully!`)
      setTimeout(() => setSuccessMessage(''), 3000)
      onCreated?.()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create media')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-green-700 text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      <MediaFormFields
        name={name}
        onNameChange={setName}
        carbonSources={carbonSources}
        onCarbonSourcesChange={setCarbonSources}
        nitrogenSources={nitrogenSources}
        onNitrogenSourcesChange={setNitrogenSources}
        complexComponents={complexComponents}
        onComplexComponentsChange={setComplexComponents}
        additionalComponents={additionalComponents}
        onAdditionalComponentsChange={setAdditionalComponents}
        catalog={catalog}
      />

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleCreate}
          disabled={!name.trim() || isCreating}
          className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating…' : 'Create Media'}
        </button>
      </div>
    </div>
  )
}

export default CreateMedia
