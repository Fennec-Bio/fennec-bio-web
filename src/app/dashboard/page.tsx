'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ExperimentList } from '@/components/Shared/ExperimentList'
import { QuickView } from '@/components/dashboard/QuickView'
import { Overlay } from '@/components/dashboard/Overlay'
import { VariableImpact } from '@/components/dashboard/VariableImpact'
import { AIRecommendations } from '@/components/AIRecommendations'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

interface CollapsibleSectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

function CollapsibleSection({ title, isOpen, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left text-xl md:text-2xl font-bold text-gray-900 hover:bg-gray-50 rounded-t-lg"
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-gray-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-500" />
        )}
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isQuickGraphOpen, setIsQuickGraphOpen] = useState(true)
  const [isOverlayOpen, setIsOverlayOpen] = useState(true)
  const [isVariableImpactOpen, setIsVariableImpactOpen] = useState(true)
  const [isAIRecommendationsOpen, setIsAIRecommendationsOpen] = useState(true)

  const handleExperimentSelect = useCallback((experiment: Experiment) => {
    setSelectedExperiment(experiment)
    setIsMobileMenuOpen(false)
  }, [])

  const handleExperimentsChange = useCallback((experiments: Experiment[]) => {
    setExperiments(experiments)
    if (experiments.length === 0) {
      setSelectedExperiment(null)
    }
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
            {!selectedExperiment && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl md:text-2xl font-bold">Dashboard</h2>
                <p className="text-gray-500 mt-2">Select an experiment to view details.</p>
              </div>
            )}

            <CollapsibleSection
              title="AI Recommendations"
              isOpen={isAIRecommendationsOpen}
              onToggle={() => setIsAIRecommendationsOpen(!isAIRecommendationsOpen)}
            >
              <AIRecommendations />
            </CollapsibleSection>

            <CollapsibleSection
              title="Quick Graph"
              isOpen={isQuickGraphOpen}
              onToggle={() => setIsQuickGraphOpen(!isQuickGraphOpen)}
            >
              <QuickView
                selectedExperiment={selectedExperiment}
                onExperimentSelect={handleExperimentSelect}
                experiments={experiments}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Overlay"
              isOpen={isOverlayOpen}
              onToggle={() => setIsOverlayOpen(!isOverlayOpen)}
            >
              <Overlay experiments={experiments} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Analysis"
              isOpen={isVariableImpactOpen}
              onToggle={() => setIsVariableImpactOpen(!isVariableImpactOpen)}
            >
              <VariableImpact />
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </div>
  )
}
