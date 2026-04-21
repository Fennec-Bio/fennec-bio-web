'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Plate } from '@/hooks/usePlateExperiment'

export function PlateManager({
  experimentId, plates, onChanged, children,
}: {
  experimentId: string
  plates: Plate[]
  onChanged: () => void
  children: (plate: Plate) => React.ReactNode
}) {
  const { getToken } = useAuth()
  const [selected, setSelected] = useState<number | null>(plates[0]?.id ?? null)
  const [addOpen, setAddOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [fmt, setFmt] = useState<'96' | '384'>('96')
  const [addError, setAddError] = useState<string | null>(null)

  async function addPlate() {
    setAddError(null)
    const token = await getToken()
    const resp = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/plate-experiments/${experimentId}/plates/`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, format: fmt }),
      },
    )
    if (resp.ok) {
      setAddOpen(false); setLabel(''); setFmt('96')
      onChanged()
    } else {
      try {
        const body = await resp.json()
        setAddError(body.error ?? `HTTP ${resp.status}`)
      } catch {
        setAddError(`HTTP ${resp.status}`)
      }
    }
  }

  const active = plates.find(p => p.id === selected) ?? plates[0]

  const tabActive = 'px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium'
  const tabInactive = 'px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50'

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {plates.map(p => (
          <button
            key={p.id}
            className={p.id === active?.id ? tabActive : tabInactive}
            onClick={() => setSelected(p.id)}
          >
            {p.label} ({p.format})
          </button>
        ))}
        <button
          className="px-3 py-1.5 text-sm text-[#eb5234] hover:underline"
          onClick={() => setAddOpen(true)}
        >
          + Add plate
        </button>
      </div>

      {addOpen && (
        <div className="mb-4 bg-white rounded-lg shadow p-3 border border-gray-200">
          <div className="mb-2 flex gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="pm-label" className="block text-sm font-medium text-gray-700 mb-1">Label</label>
              <input
                id="pm-label"
                value={label}
                onChange={e => setLabel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
              />
            </div>
            <div>
              <label htmlFor="pm-fmt" className="block text-sm font-medium text-gray-700 mb-1">Format</label>
              <select
                id="pm-fmt"
                value={fmt}
                onChange={e => setFmt(e.target.value as '96' | '384')}
                className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
              >
                <option value="96">96-well</option>
                <option value="384">384-well</option>
              </select>
            </div>
          </div>
          {addError && <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{addError}</div>}
          <div className="flex gap-2">
            <button
              onClick={addPlate}
              disabled={!label.trim()}
              className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => { setAddOpen(false); setAddError(null) }}
              className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {active ? children(active) : (
        <div className="bg-white rounded-lg shadow p-6 text-gray-500">
          No plates yet. Click &ldquo;+ Add plate&rdquo; to create one.
        </div>
      )}
    </div>
  )
}
