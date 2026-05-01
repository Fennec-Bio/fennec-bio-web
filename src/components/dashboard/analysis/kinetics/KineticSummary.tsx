'use client'

import { type KineticParams, mean, standardDeviation } from '@/lib/analysis/kineticsUtils'

interface KineticSummaryProps {
  kineticParams: KineticParams[]
  selectedExperimentId: number | null
}

function formatMeanStd(values: number[]): string {
  if (values.length === 0) return 'N/A'
  if (values.length === 1) return values[0].toFixed(3)
  return `${mean(values).toFixed(3)} ± ${standardDeviation(values).toFixed(3)}`
}

function formatValue(value: number | null, decimals: number = 3): string {
  if (value === null) return 'N/A'
  return value.toFixed(decimals)
}

export function KineticSummary({ kineticParams, selectedExperimentId }: KineticSummaryProps) {
  const selectedKinetics = selectedExperimentId
    ? kineticParams.find((k) => k.experimentId === selectedExperimentId)
    : null

  const muMaxValues = kineticParams.map((k) => k.muMax).filter((v): v is number => v !== null)
  const qpMaxValues = kineticParams.map((k) => k.qpMax).filter((v): v is number => v !== null)
  const ypsValues   = kineticParams.map((k) => k.yps  ).filter((v): v is number => v !== null)

  const cards = [
    {
      label: 'μ_max',
      value: selectedKinetics ? formatValue(selectedKinetics.muMax) : 'N/A',
      aggregate: formatMeanStd(muMaxValues),
      unit: 'h⁻¹',
      description: 'Maximum specific growth rate',
      n: muMaxValues.length,
    },
    {
      label: 'qP_max',
      value: selectedKinetics ? formatValue(selectedKinetics.qpMax) : 'N/A',
      aggregate: formatMeanStd(qpMaxValues),
      unit: 'g/g/h',
      description: 'Maximum specific production rate',
      n: qpMaxValues.length,
    },
    {
      label: 'Yp/s',
      value: selectedKinetics ? formatValue(selectedKinetics.yps) : 'N/A',
      aggregate: formatMeanStd(ypsValues),
      unit: 'g/g',
      description: 'Product yield on substrate',
      n: ypsValues.length,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-lg font-semibold text-gray-900">{card.label}</span>
            <span className="text-sm text-gray-500">{card.unit}</span>
          </div>
          <div className="text-2xl font-bold text-blue-600 mb-1">{card.value}</div>
          <div className="text-xs text-gray-500">{card.description}</div>
          <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            All experiments (n={card.n}): {card.aggregate}
          </div>
        </div>
      ))}
    </div>
  )
}
