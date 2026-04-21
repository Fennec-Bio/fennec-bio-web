'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { usePlateExperiment, Plate } from '@/hooks/usePlateExperiment'
import { useDataCategories } from '@/hooks/useDataCategories'
import { DashboardTabs } from '@/components/Plate/DashboardTabs'
import { PlateManager } from '@/components/Plate/PlateManager'
import { WellGridEditor } from '@/components/Plate/WellGridEditor'
import { PlateBarChart } from '@/components/Plate/PlateBarChart'
import { WellDetailPanel } from '@/components/Plate/WellDetailPanel'

function PlateWorkArea({
  plate, categories, onRefetch, projectId,
}: {
  plate: Plate
  categories: ReturnType<typeof useDataCategories>['categories']
  onRefetch: () => void
  projectId: number | null
}) {
  const [selectedWellKey, setSelectedWellKey] = useState<string>('')
  const selectedWell = plate.wells.find(
    w => `${w.row}${w.column}` === selectedWellKey,
  ) ?? null

  const wellOptions = [...plate.wells]
    .sort((a, b) => a.row.localeCompare(b.row) || a.column - b.column)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-500">
        {plate.label} ({plate.format}-well) · {plate.wells.length} well{plate.wells.length === 1 ? '' : 's'} configured
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 min-w-0 space-y-4">
          <WellGridEditor plate={plate} dataCategories={categories} onSaved={onRefetch} />
          <PlateBarChart
            plate={plate}
            dataCategories={categories.filter(c => c.category !== 'process_data')}
          />
        </div>

        <div className="md:w-80 space-y-2">
          <div>
            <label htmlFor="well-picker" className="block text-xs uppercase text-gray-500 mb-1">
              Well details
            </label>
            <select
              id="well-picker"
              value={selectedWellKey}
              onChange={e => setSelectedWellKey(e.target.value)}
              className="w-full h-9 px-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
            >
              <option value="">Select a well…</option>
              {wellOptions.map(w => (
                <option key={w.id} value={`${w.row}${w.column}`}>
                  {w.row}{w.column}
                </option>
              ))}
            </select>
          </div>
          <WellDetailPanel
            well={selectedWell}
            projectId={projectId}
            onPromoted={onRefetch}
          />
        </div>
      </div>
    </div>
  )
}

export default function PlateExperimentDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error, refetch } = usePlateExperiment(id)
  const { categories } = useDataCategories(data?.project ?? null)

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        <DashboardTabs />
        {loading && <div className="p-4 text-gray-500">Loading…</div>}
        {error && <div className="p-4 text-red-600">{error}</div>}
        {data && (
          <>
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{data.title}</h1>
                <div className="text-xs text-gray-500">
                  {data.project_name} · {data.date ?? '—'}
                </div>
                {data.description && (
                  <div className="mt-2 text-sm text-gray-700">{data.description}</div>
                )}
              </div>
              <Link
                href="/dashboard/plates"
                className="text-sm text-gray-500 hover:text-gray-900"
              >
                ← All plate experiments
              </Link>
            </header>

            <PlateManager experimentId={data.id} plates={data.plates} onChanged={refetch}>
              {(plate) => (
                <PlateWorkArea
                  plate={plate}
                  categories={categories}
                  onRefetch={refetch}
                  projectId={data.project}
                />
              )}
            </PlateManager>
          </>
        )}
      </div>
    </div>
  )
}
