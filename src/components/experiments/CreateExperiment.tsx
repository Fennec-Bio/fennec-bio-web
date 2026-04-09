'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { StepIndicator } from './StepIndicator'
import { Step1Details } from './Step1Details'
import { Step2Upload, ClassifiedData, DataCategoryEntry } from './Step2Upload'
import { Step3Review } from './Step3Review'
import { useProjectContext } from '@/hooks/useProjectContext'

export function CreateExperiment({ onCreated }: { onCreated?: () => void } = {}) {
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
  const [experimentSummary, setExperimentSummary] = useState('')
  const [experimentNote, setExperimentNote] = useState('')
  const [experimentDate, setExperimentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [noteImages, setNoteImages] = useState<File[]>([])
  const [strainNames, setStrainNames] = useState<string[]>([])
  const [selectedStrain, setSelectedStrain] = useState('')
  const [extractEventsWithAI, setExtractEventsWithAI] = useState(false)
  const [extractAnomaliesWithAI, setExtractAnomaliesWithAI] = useState(false)

  // UI state
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isExtractingAI, setIsExtractingAI] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [uniqueNames, setUniqueNames] = useState<{
    variables: Record<string, string[]>
    events: string[]
    anomalies: string[]
  }>({ variables: {}, events: [], anomalies: [] })
  const [dataTemplates, setDataTemplates] = useState<{ id: number; name: string; sheets: { sheet_name: string; start_row: number; timepoint_column: string; time_unit: string; column_mappings: { column: string; name: string; category: string; unit: string }[] }[]; sheet_name: string; timepoint_column: string; time_unit: string; column_mappings: { column: string; name: string; category: string; unit: string }[] }[]>([])
  const [dataCategories, setDataCategories] = useState<DataCategoryEntry[]>([])

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
        const names = data.unique_names ?? data
        setUniqueNames({
          variables: names.variables ?? {},
          events: names.events ?? [],
          anomalies: names.anomalies ?? [],
        })
      } catch {
        // silently fail — dropdowns will just be empty
      }
    }

    fetchUniqueNames()

    // Fetch data templates
    const fetchTemplates = async () => {
      if (!activeProject) return
      try {
        const token = await getToken()
        const res = await fetch(`${apiUrl}/api/data-templates/?project_id=${activeProject.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setDataTemplates(await res.json())
      } catch {
        // Non-critical
      }
    }
    fetchTemplates()

    const fetchStrains = async () => {
      if (!activeProject) return
      try {
        const token = await getToken()
        const res = await fetch(`${apiUrl}/api/strains/?project_id=${activeProject.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const names: string[] = (data.strains || []).map((s: { name: string }) => s.name)
          setStrainNames(names.sort((a, b) => a.localeCompare(b)))
        }
      } catch {
        // Non-critical
      }
    }
    fetchStrains()

    // Fetch data categories — single source of truth for data_type
    const fetchDataCategories = async () => {
      if (!activeProject) {
        setDataCategories([])
        return
      }
      try {
        const token = await getToken()
        const res = await fetch(
          `${apiUrl}/api/data-categories/?project_id=${activeProject.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) setDataCategories(await res.json())
        else setDataCategories([])
      } catch {
        setDataCategories([])
      }
    }
    fetchDataCategories()
  }, [getToken, apiUrl, activeProject])

  const handleStrainChange = (strain: string) => {
    setSelectedStrain(strain)
    setVariables(prev => {
      const withoutStrain = prev.filter(v => v.name.toLowerCase() !== 'strain')
      if (strain) {
        return [...withoutStrain, { name: 'strain', value: strain }]
      }
      return withoutStrain
    })
  }

  const handleGenerateSummary = async () => {
    if (!experimentNote.trim()) return
    setIsGeneratingSummary(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/generate-experiment-summary/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: experimentNote }),
      })
      if (res.ok) {
        const data = await res.json()
        setExperimentSummary(data.summary)
      } else {
        const errData = await res.json().catch(() => ({}))
        setErrorMessage(errData.error || 'Failed to generate summary')
      }
    } catch {
      setErrorMessage('Failed to generate summary')
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const handleNextFromStep1 = async () => {
    setErrorMessage('')

    // If no AI extraction needed, just advance
    if ((!extractEventsWithAI && !extractAnomaliesWithAI) || !experimentNote.trim()) {
      setStep(2)
      return
    }

    setIsExtractingAI(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/extract-events-anomalies/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: experimentNote }),
      })
      if (res.ok) {
        const extracted = await res.json()
        if (extractEventsWithAI && Array.isArray(extracted.events)) {
          setEvents(extracted.events)
        }
        if (extractAnomaliesWithAI && Array.isArray(extracted.anomalies)) {
          setAnomalies(extracted.anomalies)
        }
        setStep(2)
      } else {
        const errData = await res.json().catch(() => ({}))
        setErrorMessage(errData.error || 'AI extraction failed')
      }
    } catch {
      setErrorMessage('AI extraction failed')
    } finally {
      setIsExtractingAI(false)
    }
  }

  const resetForm = () => {
    setTitle('')
    setVariables([])
    setEvents([])
    setAnomalies([])
    setClassifiedData(null)
    setErrorMessage('')
    setExperimentSummary('')
    setExperimentNote('')
    setExperimentDate(new Date().toISOString().slice(0, 10))
    setNoteImages([])
    setSelectedStrain('')
    setExtractEventsWithAI(false)
    setExtractAnomaliesWithAI(false)
  }

  const handleCreate = async () => {
    setIsCreating(true)
    setErrorMessage('')

    try {
      // Check for duplicate variable names
      const filledVars = variables.filter((v) => v.name.trim() !== '')
      const varNames = filledVars.map((v) => v.name)
      const dupes = varNames.filter((n, i) => varNames.indexOf(n) !== i)
      if (dupes.length > 0) {
        setErrorMessage(`Duplicate variable: "${dupes[0]}". Each variable name can only be used once.`)
        setIsCreating(false)
        return
      }

      const token = await getToken()

      const finalEvents = events.filter((e) => e.name.trim() !== '')
      const finalAnomalies = anomalies.filter((a) => a.name.trim() !== '')

      const body = {
        title,
        project_id: activeProject?.id,
        description: experimentSummary,
        experiment_note: experimentNote,
        date: experimentDate,
        variables: filledVars,
        events: finalEvents,
        anomalies: finalAnomalies,
        products: classifiedData?.products.map((p) => ({
          name: p.name,
          unit: p.unit,
          data_type: p.data_type,
          time_unit: p.time_unit,
          data: p.data.map((d) => ({ timepoint: d.timepoint, value: d.value })),
        })) ?? [],
        secondary_products: classifiedData?.secondary_products.map((p) => ({
          name: p.name,
          unit: p.unit,
          type: p.type,
          data_type: p.data_type,
          time_unit: p.time_unit,
          data: p.data.map((d) => ({ timepoint: d.timepoint, value: d.value })),
        })) ?? [],
        process_data: classifiedData?.process_data.map((p) => ({
          name: p.name,
          unit: p.unit,
          type: p.type,
          data_type: p.data_type,
          time_unit: p.time_unit,
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

      // Parse response and upload note images in parallel. We MUST await
      // and surface failures — previously this was fire-and-forget with
      // errors silently swallowed, which let the user think their images
      // had been attached when in fact every upload had failed (size limit,
      // GCS auth, network blip, etc.) and there was no way to tell.
      const responseData = await res.json()
      if (noteImages.length > 0) {
        const experimentId = responseData.experiment.id
        const uploadResults = await Promise.all(
          noteImages.map(async (imageFile) => {
            try {
              const formData = new FormData()
              formData.append('image', imageFile)
              const uploadRes = await fetch(
                `${apiUrl}/api/experiments/${experimentId}/note-images/`,
                {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                  body: formData,
                },
              )
              if (!uploadRes.ok) {
                const errJson = await uploadRes.json().catch(() => ({}))
                return {
                  ok: false as const,
                  name: imageFile.name,
                  error: errJson.error || `HTTP ${uploadRes.status}`,
                }
              }
              return { ok: true as const, name: imageFile.name }
            } catch (uploadErr) {
              return {
                ok: false as const,
                name: imageFile.name,
                error: uploadErr instanceof Error ? uploadErr.message : 'Upload failed',
              }
            }
          }),
        )
        const failed = uploadResults.filter((r) => !r.ok)
        if (failed.length > 0) {
          const detail = failed.map((f) => `${f.name}: ${f.error}`).join('; ')
          // Experiment was created successfully — surface partial failure
          // instead of pretending nothing went wrong.
          setErrorMessage(
            `Experiment created, but ${failed.length} of ${noteImages.length} image upload(s) failed — ${detail}`,
          )
          setIsCreating(false)
          onCreated?.()
          return
        }
      }

      // Success — reset everything and show banner
      resetForm()
      setStep(1)
      setSuccessMessage(`Experiment "${title}" created successfully!`)
      setTimeout(() => setSuccessMessage(''), 3000)
      onCreated?.()
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
            experimentDate={experimentDate}
            onExperimentDateChange={setExperimentDate}
            strains={strainNames}
            selectedStrain={selectedStrain}
            onStrainChange={handleStrainChange}
            variables={variables}
            onVariablesChange={setVariables}
            events={events}
            onEventsChange={setEvents}
            anomalies={anomalies}
            onAnomaliesChange={setAnomalies}
            uniqueNames={uniqueNames}
            experimentSummary={experimentSummary}
            onExperimentSummaryChange={setExperimentSummary}
            experimentNote={experimentNote}
            onExperimentNoteChange={setExperimentNote}
            noteImages={noteImages}
            onNoteImagesChange={setNoteImages}
            extractEventsWithAI={extractEventsWithAI}
            onExtractEventsWithAIChange={setExtractEventsWithAI}
            extractAnomaliesWithAI={extractAnomaliesWithAI}
            onExtractAnomaliesWithAIChange={setExtractAnomaliesWithAI}
            onGenerateSummaryWithAI={handleGenerateSummary}
            isGeneratingSummary={isGeneratingSummary}
          />
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleNextFromStep1}
              disabled={!title.trim() || isExtractingAI}
              className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExtractingAI ? 'Extracting with AI...' : 'Next: Upload Data →'}
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
            dataTemplates={dataTemplates}
            dataCategories={dataCategories}
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
            onTitleChange={setTitle}
            variables={variables}
            onVariablesChange={setVariables}
            events={events}
            onEventsChange={setEvents}
            anomalies={anomalies}
            onAnomaliesChange={setAnomalies}
            uniqueNames={uniqueNames}
            experimentSummary={experimentSummary}
            onExperimentSummaryChange={setExperimentSummary}
            experimentNote={experimentNote}
            onExperimentNoteChange={setExperimentNote}
            experimentDate={experimentDate}
            onExperimentDateChange={setExperimentDate}
            noteImages={noteImages}
            onNoteImagesChange={setNoteImages}
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
