'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { useDataCategories } from '@/hooks/useDataCategories'
import { useProjectMedia } from '@/hooks/useProjectMedia'
import { useProjectStrains } from '@/hooks/useProjectStrains'
import { PlateStepIndicator } from '@/components/Plate/PlateStepIndicator'
import { PlateStep1Details } from '@/components/Plate/PlateStep1Details'
import { PlateStep2PlatesAndWells, PlateDraft } from '@/components/Plate/PlateStep2PlatesAndWells'
import { PlateStep3Review } from '@/components/Plate/PlateStep3Review'

function freshSeedPlates(): PlateDraft[] {
  return [{
    localKey: `p_${Date.now()}_seed`,
    label: 'Plate 1',
    format: '96',
    variableGrids: {},
    measurementGrids: {},
    variableNames: ['Strain', 'Media'],
    measurementIds: [],
  }]
}

function countWellsWithData(plate: PlateDraft): number {
  const keys = new Set<string>()
  Object.values(plate.variableGrids).forEach(g => Object.keys(g).forEach(k => keys.add(k)))
  Object.values(plate.measurementGrids).forEach(g => Object.keys(g).forEach(k => keys.add(k)))
  return keys.size
}

function buildWellsPayload(plate: PlateDraft) {
  const wellKeys = new Set<string>()
  Object.values(plate.variableGrids).forEach(g => Object.keys(g).forEach(k => wellKeys.add(k)))
  Object.values(plate.measurementGrids).forEach(g => Object.keys(g).forEach(k => wellKeys.add(k)))
  return Array.from(wellKeys).map(k => {
    const row = k.charAt(0)
    const column = parseInt(k.slice(1), 10)
    const variables = Object.entries(plate.variableGrids)
      .map(([name, grid]) => ({ name, value: grid[k] ?? '' }))
      .filter(v => v.value !== '')
    const data_points = Object.entries(plate.measurementGrids)
      .map(([catId, grid]) => {
        const raw = grid[k]
        if (raw === undefined || raw === '') return null
        const value = parseFloat(raw)
        if (Number.isNaN(value)) return null
        return { data_category_id: Number(catId), value }
      })
      .filter((d): d is { data_category_id: number; value: number } => d !== null)
    return { row, column, variables, data_points }
  })
}

export function CreatePlateWizard({
  onCreated, onCancel,
}: {
  onCreated?: () => void
  onCancel?: () => void
} = {}) {
  const { getToken } = useAuth()
  const router = useRouter()
  const { activeProject } = useProjectContext()

  // When no explicit onCancel is provided, default to router.back() — matches
  // the legacy single-page form's UX on /dashboard/plates/new. Callers that
  // want a different cancel behavior (e.g. the /experiments picker returning
  // to the type-chooser) pass their own onCancel.
  const effectiveOnCancel = onCancel ?? (() => router.back())
  const projectId = activeProject?.id ?? null
  const { categories } = useDataCategories(projectId)
  const { names: strainSuggestions } = useProjectStrains(projectId)
  const { names: mediaSuggestions } = useProjectMedia(projectId)
  const API = process.env.NEXT_PUBLIC_API_URL

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [plates, setPlates] = useState<PlateDraft[]>(freshSeedPlates)
  const [selectedPlateKey, setSelectedPlateKey] = useState<string>(() => plates[0].localKey)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  function resetForAnother() {
    const seeded = freshSeedPlates()
    setStep(1)
    setTitle('')
    setDescription('')
    setDate(new Date().toISOString().slice(0, 10))
    setPlates(seeded)
    setSelectedPlateKey(seeded[0].localKey)
    setErrorMessage('')
    // successMessage is cleared lazily when the user starts typing again.
  }

  async function handleCreate() {
    if (!projectId || !title.trim() || plates.length === 0) return
    setIsCreating(true)
    setErrorMessage('')
    setSuccessMessage('')

    let experimentId: string | null = null
    try {
      const token = await getToken()

      // 1. Create the plate experiment shell.
      const expResp = await fetch(`${API}/api/plate-experiments/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          project: projectId,
          description,
          date: date || null,
        }),
      })
      if (!expResp.ok) throw new Error(`Could not create plate experiment: ${await expResp.text()}`)
      const expData = await expResp.json()
      experimentId = expData.id as string

      // 2. For each plate draft: create the plate then (if any data) upsert wells.
      for (const plate of plates) {
        const plateResp = await fetch(
          `${API}/api/plate-experiments/${experimentId}/plates/`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: plate.label, format: plate.format }),
          },
        )
        if (!plateResp.ok) throw new Error(`Could not create plate "${plate.label}": ${await plateResp.text()}`)
        const plateData = await plateResp.json()
        const plateId = plateData.id as number

        const wellsPayload = buildWellsPayload(plate)
        if (wellsPayload.length > 0) {
          const wellsResp = await fetch(
            `${API}/api/plates/${plateId}/wells/`,
            {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ wells: wellsPayload }),
            },
          )
          if (!wellsResp.ok) throw new Error(`Could not save wells for plate "${plate.label}": ${await wellsResp.text()}`)
        }
      }

      setSuccessMessage(`Plate experiment "${title.trim()}" created successfully.`)
      onCreated?.()
      resetForAnother()
    } catch (e) {
      const base = (e as Error).message
      const hint = experimentId
        ? `\nThe plate experiment (id ${experimentId}) may have been partially created. You can delete it from the plate list if you want to start over.`
        : ''
      setErrorMessage(base + hint)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div>
      <PlateStepIndicator currentStep={step} />

      {step === 1 && (
        <PlateStep1Details
          title={title}
          onTitleChange={v => { setTitle(v); setSuccessMessage('') }}
          description={description}
          onDescriptionChange={setDescription}
          date={date}
          onDateChange={setDate}
          onNext={() => setStep(2)}
          onCancel={effectiveOnCancel}
        />
      )}

      {step === 2 && (
        <PlateStep2PlatesAndWells
          plates={plates}
          onPlatesChange={setPlates}
          selectedPlateKey={selectedPlateKey}
          onSelectedPlateKeyChange={setSelectedPlateKey}
          dataCategories={categories}
          projectId={projectId}
          strainSuggestions={strainSuggestions}
          mediaSuggestions={mediaSuggestions}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <PlateStep3Review
          title={title}
          date={date}
          plates={plates.map(p => ({
            label: p.label,
            format: p.format,
            wellsWithDataCount: countWellsWithData(p),
          }))}
          errorMessage={errorMessage}
          successMessage={successMessage}
          isCreating={isCreating}
          onBack={() => setStep(2)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
