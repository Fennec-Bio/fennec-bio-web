'use client'

import { useMemo, useState } from 'react'
import type { KineticParams } from '@/lib/analysis/kineticsUtils'

interface ComparisonTableProps {
  kineticParams: KineticParams[]
  onSelectExperiment: (id: number) => void
  selectedExperiment: number | null
}

type SortField = 'title' | 'muMax' | 'qpMax' | 'yps' | 'productivity' | 'finalTiter'
type SortDirection = 'asc' | 'desc'

export function ComparisonTable({
  kineticParams,
  onSelectExperiment,
  selectedExperiment,
}: ComparisonTableProps) {
  const [sortField, setSortField] = useState<SortField>('finalTiter')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedParams = useMemo(() => {
    const sorted = [...kineticParams].sort((a, b) => {
      if (sortField === 'title') {
        const cmp = a.title.toLowerCase().localeCompare(b.title.toLowerCase())
        return sortDirection === 'asc' ? cmp : -cmp
      }
      const av = a[sortField]
      const bv = b[sortField]
      if (av === null && bv === null) return 0
      if (av === null) return sortDirection === 'asc' ? 1 : -1
      if (bv === null) return sortDirection === 'asc' ? -1 : 1
      const diff = (av as number) - (bv as number)
      return sortDirection === 'asc' ? diff : -diff
    })
    return sorted
  }, [kineticParams, sortField, sortDirection])

  const bestValues = useMemo(() => {
    const getBest = (field: keyof KineticParams): number | null => {
      const values = kineticParams
        .map((k) => k[field])
        .filter((v): v is number => typeof v === 'number' && v !== null)
      return values.length > 0 ? Math.max(...values) : null
    }
    return {
      muMax: getBest('muMax'),
      qpMax: getBest('qpMax'),
      yps: getBest('yps'),
      productivity: getBest('productivity'),
      finalTiter: getBest('finalTiter'),
    }
  }, [kineticParams])

  const formatValue = (value: number | null, decimals: number = 3): string => {
    if (value === null) return '-'
    return value.toFixed(decimals)
  }

  const isBest = (field: keyof typeof bestValues, value: number | null): boolean => {
    if (value === null || bestValues[field] === null) return false
    return Math.abs(value - bestValues[field]!) < 0.0001
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">{'↕'}</span>
    return (
      <span className="text-blue-600 ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-900">Experiment Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => handleSort('title')}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Experiment<SortIcon field="title" />
              </th>
              <th onClick={() => handleSort('muMax')}
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                {'μ_max (h⁻¹)'}<SortIcon field="muMax" />
              </th>
              <th onClick={() => handleSort('qpMax')}
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                qP_max (g/g/h)<SortIcon field="qpMax" />
              </th>
              <th onClick={() => handleSort('yps')}
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Yp/s (g/g)<SortIcon field="yps" />
              </th>
              <th onClick={() => handleSort('productivity')}
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Productivity (g/L/h)<SortIcon field="productivity" />
              </th>
              <th onClick={() => handleSort('finalTiter')}
                className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Final Titer (g/L)<SortIcon field="finalTiter" />
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedParams.map((params) => (
              <tr key={params.experimentId}
                onClick={() => onSelectExperiment(params.experimentId)}
                className={`cursor-pointer transition-colors ${
                  selectedExperiment === params.experimentId ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {params.title}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${
                  isBest('muMax', params.muMax) ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                  {formatValue(params.muMax)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${
                  isBest('qpMax', params.qpMax) ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                  {formatValue(params.qpMax)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${
                  isBest('yps', params.yps) ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                  {formatValue(params.yps)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${
                  isBest('productivity', params.productivity) ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                  {formatValue(params.productivity)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${
                  isBest('finalTiter', params.finalTiter) ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                  {formatValue(params.finalTiter, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sortedParams.length === 0 && (
        <div className="px-4 py-8 text-center text-gray-500">
          No experiments with kinetic data available
        </div>
      )}
    </div>
  )
}
