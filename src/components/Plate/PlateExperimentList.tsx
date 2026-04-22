'use client'

import Link from 'next/link'
import { useProjectContext } from '@/hooks/useProjectContext'
import { usePlateExperiments } from '@/hooks/usePlateExperiment'

export function PlateExperimentList() {
  const { activeProject } = useProjectContext()
  const projectId = activeProject?.id ?? null
  const { data, loading, error } = usePlateExperiments({ projectId })

  if (loading) return <div className="p-4 text-gray-500">Loading…</div>
  if (error) return <div className="p-4 text-red-600">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Plate Experiments</h2>
        <Link
          href="/dashboard/plates/new"
          className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] transition-colors"
        >
          New plate experiment
        </Link>
      </div>

      {data.results.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-gray-500">
          No plate experiments yet. Click <span className="font-medium text-gray-900">New plate experiment</span> to create one.
        </div>
      ) : (
        <ul className="bg-white rounded-lg shadow divide-y divide-gray-200">
          {data.results.map(pe => (
            <li key={pe.id}>
              <Link
                href={`/dashboard/plates/${pe.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium text-gray-900">{pe.title}</div>
                  <div className="text-xs text-gray-500">
                    {pe.project_name} · {pe.plate_count} plate{pe.plate_count === 1 ? '' : 's'} · {pe.date ?? '—'}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Updated {new Date(pe.updated_at).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
