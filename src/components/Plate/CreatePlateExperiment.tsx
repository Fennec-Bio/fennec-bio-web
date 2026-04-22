'use client'

import { CreatePlateWizard } from '@/components/Plate/CreatePlateWizard'

export function CreatePlateExperiment({
  onCreated, onCancel,
}: {
  onCreated?: () => void
  onCancel?: () => void
} = {}) {
  return <CreatePlateWizard onCreated={onCreated} onCancel={onCancel} />
}
