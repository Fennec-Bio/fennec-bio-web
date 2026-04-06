'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@clerk/nextjs'

interface StrainLineageData {
  name: string
  parent: string | null
  experiment_count: number
  max_titers: Record<string, number>
  modifications: {
    id: number
    modification_type: string
    gene_name: string
  }[]
  lineage_id: number | null
}

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

interface StrainStatsProps {
  strainName: string
  lineageData: StrainLineageData[]
  onSelectStrain: (name: string) => void
}

const modTypeBadge: Record<string, string> = {
  insertion: 'bg-green-100 text-green-800',
  deletion: 'bg-red-100 text-red-800',
  modification: 'bg-amber-100 text-amber-800',
  plasmid: 'bg-purple-100 text-purple-800',
}

export function StrainStats({ strainName, lineageData, onSelectStrain }: StrainStatsProps) {
  const { getToken } = useAuth()
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(false)

  const strain = useMemo(
    () => lineageData.find(s => s.name === strainName) ?? null,
    [lineageData, strainName]
  )

  const children = useMemo(
    () => lineageData.filter(s => s.parent === strainName),
    [lineageData, strainName]
  )

  // Fetch experiments for this strain in a single request
  useEffect(() => {
    let cancelled = false
    const fetchExps = async () => {
      setLoading(true)
      try {
        const token = await getToken()
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/strain-experiments/${encodeURIComponent(strainName)}/`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        if (!cancelled) setExperiments(data.experiments || [])
      } catch (err) {
        console.error('Error fetching strain experiments:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchExps()
    return () => { cancelled = true }
  }, [strainName, getToken])

  if (!strain) {
    return (
      <div className="bg-white rounded-lg shadow p-4 text-center text-gray-500">
        No data available for strain {strainName}
      </div>
    )
  }

  const bestTiter = strain.max_titers.total || 0
  const topProduct = Object.entries(strain.max_titers)
    .filter(([k]) => k !== 'total')
    .sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-xl font-bold text-gray-900">{strainName} Statistics</h3>
      </div>

      <div className="p-4 space-y-6">
        {/* Performance overview cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500">Best Titer (Total)</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{bestTiter.toFixed(1)}</div>
            {topProduct && (
              <div className="text-xs text-gray-400 mt-1">Top: {topProduct[0]} ({topProduct[1].toFixed(1)})</div>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500">Experiments</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{strain.experiment_count}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-500">Modifications</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{strain.modifications.length}</div>
          </div>
        </div>

        {/* Product titers */}
        {Object.keys(strain.max_titers).filter(k => k !== 'total').length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Product Titers (max)</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Max Titer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Object.entries(strain.max_titers)
                    .filter(([k]) => k !== 'total')
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, value]) => (
                      <tr key={name}>
                        <td className="px-4 py-2 text-sm">{name}</td>
                        <td className="px-4 py-2 text-sm text-right font-mono">{value.toFixed(1)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modifications */}
        {strain.modifications.length > 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Modifications</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Gene</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {strain.modifications.map(m => (
                    <tr key={m.id}>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${modTypeBadge[m.modification_type] || 'bg-gray-100 text-gray-800'}`}>
                          {m.modification_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">{m.gene_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Lineage links */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Lineage</h4>
          <div className="flex flex-wrap gap-3 text-sm">
            <div>
              <span className="text-gray-500">Parent: </span>
              {strain.parent ? (
                <button onClick={() => onSelectStrain(strain.parent!)} className="text-blue-600 hover:underline">
                  {strain.parent}
                </button>
              ) : (
                <span className="text-gray-400">None (root)</span>
              )}
            </div>
            {children.length > 0 && (
              <div>
                <span className="text-gray-500">Children: </span>
                {children.map((c, i) => (
                  <span key={c.name}>
                    {i > 0 && ', '}
                    <button onClick={() => onSelectStrain(c.name)} className="text-blue-600 hover:underline">
                      {c.name}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Experiments table */}
        <div>
          <h4 className="font-semibold text-gray-900 mb-2">Experiments</h4>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
            </div>
          ) : experiments.length === 0 ? (
            <p className="text-sm text-gray-500">No experiments found for this strain.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {experiments.map(exp => (
                    <tr key={exp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-blue-600">{exp.title}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 max-w-[300px] truncate">{exp.description || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(exp.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StrainStats
