'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { StepIndicator } from './StepIndicator'
import { Step1Details } from './Step1Details'
import { Step2Upload, ClassifiedData } from './Step2Upload'
import { Step3Review } from './Step3Review'
import { useProjectContext } from '@/hooks/useProjectContext'

export function CreateExperiment() {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  // Step state
  const [step, setStep] = useState(1)

  // Form state
  const [title, setTitle] = useState('')
  const [variables, setVariables] = useState<{ name: string; value: string }[]>([])
  const [events, setEvents] = useState<{ name: string; timepoint: string }[]>([])
  const [anomalies, setAnomalies] = useState<{ name: string; timepoint: string; description: string }[]>([])
  const [classifiedData, setClassifiedData] = useState<ClassifiedData | null>(null)
  const [experimentNote, setExperimentNote] = useState('')
  const [noteImages, setNoteImages] = useState<File[]>([])

  // UI state
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [uniqueNames, setUniqueNames] = useState<{
    variables: Record<string, string[]>
    events: string[]
    anomalies: string[]
  }>({ variables: {}, events: [], anomalies: [] })

  // Fetch unique_names on mount (and when active project changes)
  useEffect(() => {
    const fetchUniqueNames = async () => {
      try {
        const token = await getToken()
        const params = activeProject ? `?project_id=${activeProject.id}` : ''
        const res = await fetch(`${apiUrl}/api/uniqueNames/${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        setUniqueNames({
          variables: data.unique_names?.variables ?? {},
          events: data.unique_names?.events ?? [],
          anomalies: data.unique_names?.anomalies ?? [],
        })
      } catch {
        // silently fail — dropdowns will just be empty
      }
    }

    fetchUniqueNames()
  }, [getToken, apiUrl, activeProject])

  const resetForm = () => {
    setTitle('')
    setVariables([])
    setEvents([])
    setAnomalies([])
    setClassifiedData(null)
    setErrorMessage('')
    setExperimentNote('')
    setNoteImages([])
  }

  const handleCreate = async () => {
    setIsCreating(true)
    setErrorMessage('')

    try {
      const token = await getToken()

      const body = {
        title,
        project_id: activeProject?.id,
        experiment_note: experimentNote,
        variables: variables.filter((v) => v.name.trim() !== ''),
        events: events.filter((e) => e.name.trim() !== ''),
        anomalies: anomalies.filter((a) => a.name.trim() !== ''),
        products: classifiedData?.products.map((p) => ({
          name: p.name,
          unit: p.unit,
          data_type: p.data_type,
          data: p.data.map((d) => ({ timepoint: d.timepoint, value: d.value })),
        })) ?? [],
        secondary_products: classifiedData?.secondary_products.map((p) => ({
          name: p.name,
          unit: p.unit,
          type: p.type,
          data_type: p.data_type,
          data: p.data.map((d) => ({ timepoint: d.timepoint, value: d.value })),
        })) ?? [],
        process_data: classifiedData?.process_data.map((p) => ({
          name: p.name,
          unit: p.unit,
          type: p.type,
          data_type: p.data_type,
          data: p.data.map((d) => ({ time: d.time, value: d.value })),
        })) ?? [],
      }

      const res = await fetch(`${apiUrl}/api/experiments/create/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.detail || `Request failed (${res.status})`)
      }

      // Parse response and upload images if any
      const responseData = await res.json()
      if (noteImages.length > 0) {
        const experimentId = responseData.experiment.id
        for (const imageFile of noteImages) {
          const formData = new FormData()
          formData.append('image', imageFile)
          await fetch(`${apiUrl}/api/experiments/${experimentId}/note-images/`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          })
        }
      }

      // Success — reset everything and show banner
      resetForm()
      setStep(1)
      setSuccessMessage(`Experiment "${title}" created successfully!`)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create experiment')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Success banner */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-green-700 text-sm">
          {successMessage}
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Step 1: Details */}
      {step === 1 && (
        <>
          <StepIndicator currentStep={1} />
          <Step1Details
            title={title}
            onTitleChange={setTitle}
            variables={variables}
            onVariablesChange={setVariables}
            events={events}
            onEventsChange={setEvents}
            anomalies={anomalies}
            onAnomaliesChange={setAnomalies}
            uniqueNames={uniqueNames}
            experimentNote={experimentNote}
            onExperimentNoteChange={setExperimentNote}
            noteImages={noteImages}
            onNoteImagesChange={setNoteImages}
          />
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!title.trim() || isCreating}
              className="px-6 py-2 text-sm font-medium text-white rounded-md shadow-xs hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#eb5234' }}
            >
              {isCreating ? 'Creating…' : 'Create Experiment'}
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!title.trim()}
              className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: Upload Data →
            </button>
          </div>
        </>
      )}

      {/* Step 2: Upload */}
      {step === 2 && (
        <>
          <StepIndicator currentStep={2} />
          <Step2Upload
            onClassified={(data) => {
              setClassifiedData(data)
              setStep(3)
            }}
            onSkip={handleCreate}
            onBack={() => setStep(1)}
            projectId={activeProject?.id ?? 0}
          />
        </>
      )}

      {/* Step 3: Review */}
      {step === 3 && classifiedData && (
        <>
          <StepIndicator currentStep={3} />
          <Step3Review
            classifiedData={classifiedData}
            onDataChange={setClassifiedData}
            title={title}
            variableCount={variables.filter((v) => v.name.trim() !== '').length}
            eventCount={events.filter((e) => e.name.trim() !== '').length}
            onBack={() => setStep(2)}
            onCreate={handleCreate}
            isCreating={isCreating}
          />
        </>
      )}
    </div>
  )
}

export default CreateExperiment
