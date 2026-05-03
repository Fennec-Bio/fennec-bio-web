'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import * as d3 from 'd3'
import { usePlateExperiment } from '@/hooks/usePlateExperiment'
import type { Plate, Well } from '@/hooks/usePlateExperiment'
import { useDataCategories } from '@/hooks/useDataCategories'
import { tCritical95 } from '@/lib/stats'

type BarSegment = { measurementId: number; mean: number; ci: number; n: number }
type Bar = { key: string; label: string; segments: BarSegment[] }

function conditionKey(well: Well): string {
  return well.variables
    .map(v => `${v.name}=${v.value}`)
    .sort()
    .join('|')
}

function strainLabel(well: Well): string | undefined {
  return well.variables.find(v => v.name.toLowerCase() === 'strain')?.value
}

export function buildBars(
  plate: Plate,
  measurementIds: number[],
  groupReplicates: boolean,
): Bar[] {
  if (measurementIds.length === 0) return []

  if (!groupReplicates) {
    return plate.wells.map(w => ({
      key: `${w.row}${w.column}`,
      label: `${w.row}${w.column}`,
      segments: measurementIds.map(mid => {
        const dp = w.data_points.find(d => d.data_category === mid)
        return { measurementId: mid, mean: dp?.value ?? 0, ci: 0, n: dp ? 1 : 0 }
      }),
    }))
  }

  const groups = new Map<string, Well[]>()
  plate.wells.forEach(w => {
    const k = conditionKey(w) || `${w.row}${w.column}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(w)
  })

  const baseLabels = new Map<string, string>()
  groups.forEach((wells, k) => {
    const label = strainLabel(wells[0]) ?? `${wells[0].row}${wells[0].column}`
    baseLabels.set(k, label)
  })

  const labelCounts = new Map<string, number>()
  const finalLabels = new Map<string, string>()
  baseLabels.forEach((label, k) => {
    const seen = labelCounts.get(label) ?? 0
    labelCounts.set(label, seen + 1)
    finalLabels.set(k, seen === 0 ? label : `${label} (${seen + 1})`)
  })

  return Array.from(groups.entries()).map(([k, wells]) => {
    const segments: BarSegment[] = measurementIds.map(mid => {
      const values = wells
        .map(w => w.data_points.find(d => d.data_category === mid)?.value)
        .filter((v): v is number => typeof v === 'number')
      const n = values.length
      if (n === 0) return { measurementId: mid, mean: 0, ci: 0, n: 0 }
      const mean = d3.mean(values) ?? 0
      if (n < 2) return { measurementId: mid, mean, ci: 0, n }
      const sd = d3.deviation(values) ?? 0
      const ci = tCritical95(n - 1) * sd / Math.sqrt(n)
      return { measurementId: mid, mean, ci, n }
    })
    return { key: k, label: finalLabels.get(k) ?? k, segments }
  })
}

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
  const [measurementsOpen, setMeasurementsOpen] = useState(false)
  const measurementsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!measurementsOpen) return
    const handler = (e: MouseEvent) => {
      if (measurementsRef.current && !measurementsRef.current.contains(e.target as Node)) {
        setMeasurementsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [measurementsOpen])

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
        <div className="relative" ref={measurementsRef}>
          <button
            type="button"
            onClick={() => setMeasurementsOpen(o => !o)}
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all flex items-center gap-1"
          >
            Measurements ({selectedMeasurementIds.length})
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {measurementsOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] min-w-[220px] max-h-72 overflow-y-auto">
              {measurementCategories.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500">No measurements available</div>
              ) : (
                measurementCategories.map(c => {
                  const checked = selectedMeasurementIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedMeasurementIds(prev =>
                            checked ? prev.filter(id => id !== c.id) : [...prev, c.id],
                          )
                        }}
                      />
                      <span>{c.name} ({c.unit || '—'})</span>
                    </label>
                  )
                })
              )}
            </div>
          )}
        </div>
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
    </div>
  )
}
