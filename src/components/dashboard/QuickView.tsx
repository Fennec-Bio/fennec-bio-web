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

interface QuickViewProps {
  selectedExperiment: Experiment | null
  onExperimentSelect?: (experiment: Experiment) => void
  experiments: Experiment[]
}

export function QuickView({ selectedExperiment, onExperimentSelect, experiments }: QuickViewProps) {
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
        {/* Second graph - hidden on mobile */}
        <div className="hidden md:block md:flex-1 md:min-w-[380px]">
          <QuickGraph
            selectedExperiment={selectedExperiment}
            onExperimentSelect={onExperimentSelect}
            experiments={experiments}
          />
        </div>
      </div>
    </div>
  )
}

export default QuickView
