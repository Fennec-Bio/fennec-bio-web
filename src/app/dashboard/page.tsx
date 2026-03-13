'use client'

import { useState, useCallback } from 'react'
import { ExperimentList } from '@/components/Shared/ExperimentList'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

export default function Dashboard() {
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleExperimentSelect = useCallback((experiment: Experiment) => {
    setSelectedExperiment(experiment)
    setIsMobileMenuOpen(false)
  }, [])

  const handleExperimentsChange = useCallback((experiments: Experiment[]) => {
    setExperiments(experiments)
  }, [])

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Mobile menu toggle */}
      <div className="md:hidden px-3 py-2">
        <button
          className="px-4 py-2 border rounded-md text-sm hover:bg-gray-50"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? 'Close Experiments' : 'View Experiments'}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[85%] max-w-[320px] bg-white overflow-y-auto shadow-xl">
            <ExperimentList
              onExperimentSelect={handleExperimentSelect}
              onExperimentsChange={handleExperimentsChange}
              isMobileDrawer={true}
            />
          </div>
        </div>
      )}

      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        <div className="flex flex-row gap-3 md:gap-5 lg:gap-6">
          {/* Desktop sidebar */}
          <div className="hidden md:block w-[364px] min-w-[364px] max-w-[416px] flex-shrink-0 relative z-50">
            <ExperimentList
              onExperimentSelect={handleExperimentSelect}
              onExperimentsChange={handleExperimentsChange}
            />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 md:gap-5">
            {selectedExperiment ? (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl md:text-2xl font-bold">{selectedExperiment.title}</h2>
                <p className="text-gray-600 mt-2">{selectedExperiment.description}</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl md:text-2xl font-bold">Dashboard</h2>
                <p className="text-gray-500 mt-2">Select an experiment to view details.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
