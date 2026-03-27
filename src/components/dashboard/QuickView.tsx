'use client'
import React from 'react'
import { QuickGraph } from '@/components/dashboard/QuickGraph'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

interface ExperimentSetData {
  experiments: Experiment[]
  hypothesis: string
  conclusion: string
}

interface QuickViewProps {
  selectedExperiment: Experiment | null
  onExperimentSelect?: (experiment: Experiment) => void
  experiments: Experiment[]
  experimentSetData?: ExperimentSetData | null
}

export function QuickView({ selectedExperiment, onExperimentSelect, experiments, experimentSetData }: QuickViewProps) {
  // Experiment set mode: show hypothesis/conclusion + grid of graphs
  if (experimentSetData && experimentSetData.experiments.length > 0) {
    return (
      <div className="p-3 md:p-4 lg:p-6">
        {/* Hypothesis & Conclusion */}
        {(experimentSetData.hypothesis || experimentSetData.conclusion) && (
          <div className="mb-4 space-y-3">
            {experimentSetData.hypothesis && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-blue-800 mb-1">Hypothesis</h4>
                <p className="text-sm text-blue-700 whitespace-pre-wrap">{experimentSetData.hypothesis}</p>
              </div>
            )}
            {experimentSetData.conclusion && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-green-800 mb-1">Conclusion</h4>
                <p className="text-sm text-green-700 whitespace-pre-wrap">{experimentSetData.conclusion}</p>
              </div>
            )}
          </div>
        )}

        {/* Grid of graphs - 2 per row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {experimentSetData.experiments.map((exp) => (
            <div key={exp.id} className="min-w-0">
              <QuickGraph
                selectedExperiment={exp}
                onExperimentSelect={onExperimentSelect}
                experiments={experiments}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Default mode: two side-by-side graphs for single experiment
  return (
    <div className="p-3 md:p-4 lg:p-6">
      <div className="flex flex-col md:flex-row gap-4 overflow-x-auto">
        {/* First graph - always visible */}
        <div className="w-full md:flex-1 md:min-w-[380px]">
          <QuickGraph
            selectedExperiment={selectedExperiment}
            onExperimentSelect={onExperimentSelect}
            experiments={experiments}
          />
        </div>
        {/* Second graph - hidden on mobile, defaults to first experiment */}
        <div className="hidden md:block md:flex-1 md:min-w-[380px]">
          <QuickGraph
            selectedExperiment={selectedExperiment}
            onExperimentSelect={onExperimentSelect}
            experiments={experiments}
            defaultExperiment={experiments[0] ?? null}
          />
        </div>
      </div>
    </div>
  )
}

export default QuickView
