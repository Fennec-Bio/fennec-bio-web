'use client'

import { use } from 'react'
import Link from 'next/link'
import { usePlateExperiment } from '@/hooks/usePlateExperiment'
import { DashboardTabs } from '@/components/Plate/DashboardTabs'
import { PlateManager } from '@/components/Plate/PlateManager'

export default function PlateExperimentDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, loading, error, refetch } = usePlateExperiment(id)

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
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="mb-2 text-sm text-gray-500">
                    {plate.label} ({plate.format}-well) · {plate.wells.length} well{plate.wells.length === 1 ? '' : 's'} configured
                  </div>
                  {/* WellGridEditor and PlateBarChart added in Tasks 12 + 13 */}
                </div>
              )}
            </PlateManager>
          </>
        )}
      </div>
    </div>
  )
}
