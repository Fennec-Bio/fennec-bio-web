'use client'

import { useState } from 'react'
import { Well } from '@/hooks/usePlateExperiment'
import { PromoteColonyModal } from '@/components/Plate/PromoteColonyModal'

export function WellDetailPanel({
  well, projectId, onPromoted,
}: {
  well: Well | null
  projectId: number | null
  onPromoted: () => void
}) {
  const [promoteOpen, setPromoteOpen] = useState(false)

  if (!well) {
    return (
      <aside className="w-full md:w-80 bg-white rounded-lg shadow p-4 text-sm text-gray-500">
        Select a well to view its details.
      </aside>
    )
  }

  const strain = well.variables.find(v => v.name.toLowerCase() === 'strain')?.value
  const colony = well.variables.find(v => v.name.toLowerCase() === 'colony')?.value
  const canPromote = Boolean(strain && colony && projectId)

  return (
    <aside className="w-full md:w-80 bg-white rounded-lg shadow p-4">
      <div className="mb-2 font-medium text-gray-900">Well {well.row}{well.column}</div>

      <div className="mb-3">
        <div className="text-xs uppercase text-gray-500 mb-1">Variables</div>
        {well.variables.length === 0
          ? <div className="text-sm text-gray-500">None</div>
          : well.variables.map(v => (
              <div key={v.id} className="text-sm">
                <span className="font-medium">{v.name}:</span> {v.value}
              </div>
            ))
        }
      </div>

      <div className="mb-3">
        <div className="text-xs uppercase text-gray-500 mb-1">Measurements</div>
        {well.data_points.length === 0
          ? <div className="text-sm text-gray-500">None</div>
          : well.data_points.map(dp => (
              <div key={dp.id} className="text-sm">
                <span className="font-medium">{dp.data_category_name}:</span> {dp.value} {dp.unit}
              </div>
            ))
        }
      </div>

      {canPromote && (
        <button
          onClick={() => setPromoteOpen(true)}
          className="px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f]"
        >
          Promote colony to strain
        </button>
      )}

      {promoteOpen && strain && colony && projectId && (
        <PromoteColonyModal
          parentStrain={strain}
          parentColony={colony}
          projectId={projectId}
          onClose={() => setPromoteOpen(false)}
          onPromoted={() => { setPromoteOpen(false); onPromoted() }}
        />
      )}
    </aside>
  )
}
