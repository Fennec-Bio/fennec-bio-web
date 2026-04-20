'use client'

import React, { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import {
  apiComponentsToRows, ComponentRow, MediaFormFields, MediaType, rowsToPayload,
} from './MediaFormShared'
import { useMediaComponentCatalog } from './useMediaComponentCatalog'

interface EditMediaProps {
  selectedMediaId: number | null
  onUpdated?: () => void
  catalogRefreshKey?: number
}

interface MediaDetailResponse {
  id: number
  name: string
  media_type: MediaType
  project: number | null
  carbon_sources: { name: string; molecular_weight: number | null; concentration: number | null }[]
  nitrogen_sources: { name: string; molecular_weight: number | null; concentration: number | null }[]
  complex_components: { name: string; molecular_weight: number | null; concentration: number | null }[]
  additional_components: { name: string; molecular_weight: number | null; concentration: number | null }[]
}

export function EditMedia({ selectedMediaId, onUpdated, catalogRefreshKey }: EditMediaProps) {
  const { getToken } = useAuth()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL
  const catalog = useMediaComponentCatalog(catalogRefreshKey)

  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [name, setName] = useState('')
  const [mediaType, setMediaType] = useState<MediaType | ''>('')
  const [carbonSources, setCarbonSources] = useState<ComponentRow[]>([])
  const [nitrogenSources, setNitrogenSources] = useState<ComponentRow[]>([])
  const [complexComponents, setComplexComponents] = useState<ComponentRow[]>([])
  const [additionalComponents, setAdditionalComponents] = useState<ComponentRow[]>([])

  useEffect(() => {
    if (selectedMediaId == null) {
      setName('')
      setMediaType('')
      setCarbonSources([])
      setNitrogenSources([])
      setComplexComponents([])
      setAdditionalComponents([])
      setErrorMessage('')
      return
    }

    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setErrorMessage('')
      try {
        const token = await getToken()
        const res = await fetch(`${apiUrl}/api/media/${selectedMediaId}/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`Failed to load media (${res.status})`)
        const data: MediaDetailResponse = await res.json()
        if (cancelled) return
        setName(data.name)
        setMediaType(data.media_type)
        setCarbonSources(apiComponentsToRows(data.carbon_sources))
        setNitrogenSources(apiComponentsToRows(data.nitrogen_sources))
        setComplexComponents(apiComponentsToRows(data.complex_components))
        setAdditionalComponents(apiComponentsToRows(data.additional_components))
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load media')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedMediaId, apiUrl, getToken])

  if (selectedMediaId == null) {
    return (
      <div className="text-sm text-gray-500">
        Select a media from the list on the left to edit.
      </div>
    )
  }

  const handleSave = async () => {
    setErrorMessage('')
    if (!name.trim()) {
      setErrorMessage('Media name is required')
      return
    }
    if (mediaType !== 'defined' && mediaType !== 'complex') {
      setErrorMessage('Media type is required')
      return
    }

    setIsSaving(true)
    try {
      const token = await getToken()
      const body = {
        name: name.trim(),
        media_type: mediaType,
        carbon_sources: mediaType === 'defined' ? rowsToPayload(carbonSources) : [],
        nitrogen_sources: mediaType === 'defined' ? rowsToPayload(nitrogenSources) : [],
        complex_components: mediaType === 'complex' ? rowsToPayload(complexComponents) : [],
        additional_components: rowsToPayload(additionalComponents),
      }

      const res = await fetch(`${apiUrl}/api/media/${selectedMediaId}/`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Request failed (${res.status})`)
      }

      setSuccessMessage(`Media "${name.trim()}" saved!`)
      setTimeout(() => setSuccessMessage(''), 3000)
      onUpdated?.()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save media')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading media…</div>
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
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
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
          onClick={handleSave}
          disabled={!name.trim() || !mediaType || isSaving}
          className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

export default EditMedia
