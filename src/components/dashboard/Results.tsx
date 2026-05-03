'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePlateExperiment } from '@/hooks/usePlateExperiment'
import { useDataCategories } from '@/hooks/useDataCategories'

interface ResultsProps {
  plateExperimentId: string | null
}

export function Results({ plateExperimentId }: ResultsProps) {
  const { data, loading, error } = usePlateExperiment(plateExperimentId ?? '')
  const { categories } = useDataCategories(data?.project ?? null)

  const measurementCategories = useMemo(
    () => categories.filter(c => c.category !== 'process_data'),
    [categories],
  )

  const [plateIndex, setPlateIndex] = useState(0)
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<number[]>([])
  const [groupReplicates, setGroupReplicates] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlateIndex(0)
  }, [plateExperimentId])

  useEffect(() => {
    if (measurementCategories.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedMeasurementIds([])
      return
    }
    setSelectedMeasurementIds(prev => {
      const stillValid = prev.filter(id => measurementCategories.some(c => c.id === id))
      if (stillValid.length > 0) return stillValid
      return [measurementCategories[0].id]
    })
  }, [measurementCategories])

  if (plateExperimentId === null) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-gray-500">
        Select a plate experiment from the sidebar to see results.
      </div>
    )
  }
  if (loading) {
    return <div className="bg-white rounded-lg shadow p-6 text-gray-500">Loading plate data…</div>
  }
  if (error) {
    return <div className="bg-white rounded-lg shadow p-6 text-red-600">{error}</div>
  }
  if (!data) return null
  if (data.plates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-gray-500">
        This experiment has no plates yet.
      </div>
    )
  }

  const plate = data.plates[Math.min(plateIndex, data.plates.length - 1)]

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="text-sm text-gray-500">
        {data.title} · {plate.label} ({plate.format}-well)
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {data.plates.length > 1 && (
          <select
            className="h-9 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
            value={plateIndex}
            onChange={e => setPlateIndex(Number(e.target.value))}
            aria-label="Plate"
          >
            {data.plates.map((p, i) => (
              <option key={p.id} value={i}>{p.label}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={
            groupReplicates
              ? 'px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium'
              : 'px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50'
          }
          onClick={() => setGroupReplicates(v => !v)}
        >
          {groupReplicates ? 'Grouping replicates' : 'Individual wells'}
        </button>
      </div>
      <div className="text-xs text-gray-400">
        {selectedMeasurementIds.length} measurement(s) selected
      </div>
    </div>
  )
}
