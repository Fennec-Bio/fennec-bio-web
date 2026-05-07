'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ExperimentList } from '@/components/Shared/ExperimentList'
import { QuickView } from '@/components/dashboard/QuickView'
import { Overlay } from '@/components/dashboard/Overlay'
import { AIRecommendations } from '@/components/AIRecommendations'
import { Results } from '@/components/dashboard/Results'
import { DashboardSection } from '@/components/Plate/DashboardTabs'
import type { PlateExperimentListItem } from '@/hooks/usePlateExperiment'

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
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()

  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  // First experiment of the current project — held stable across pagination
  // so the right-hand QuickGraph doesn't flip every time the user pages.
  const [rightGraphDefault, setRightGraphDefault] = useState<Experiment | null>(null)
  const expectingFreshDefaultRef = useRef(true)
  const [overlayPreselected, setOverlayPreselected] = useState<Experiment[] | null>(null)
  const [selectedSetData, setSelectedSetData] = useState<{ experiments: Experiment[]; hypothesis: string; conclusion: string; batchData?: unknown[] } | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isQuickGraphOpen, setIsQuickGraphOpen] = useState(true)
  const [isOverlayOpen, setIsOverlayOpen] = useState(true)
  const [isVariableImpactOpen, setIsVariableImpactOpen] = useState(true)
  const [isAIRecommendationsOpen, setIsAIRecommendationsOpen] = useState(true)
  const [isResultsOpen, setIsResultsOpen] = useState(true)

  const [section, setSection] = useState<DashboardSection>('reactor')
  const [selectedPlateExperimentId, setSelectedPlateExperimentId] = useState<string | null>(null)
  const [plateExperimentsList, setPlateExperimentsList] = useState<PlateExperimentListItem[]>([])

  useEffect(() => {
    if (section === 'plates' && selectedPlateExperimentId === null && plateExperimentsList.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlateExperimentId(plateExperimentsList[0].id)
    }
  }, [section, selectedPlateExperimentId, plateExperimentsList])

  const handleExperimentSelect = useCallback((experiment: Experiment) => {
    setSelectedExperiment(experiment)
    setSelectedSetData(null)
    setIsMobileMenuOpen(false)
  }, [])

  const handleExperimentsChange = useCallback((experiments: Experiment[]) => {
    setExperiments(experiments)
    if (experiments.length === 0) {
      setSelectedExperiment(null)
      setRightGraphDefault(null)
      return
    }
    // Capture the first experiment of the project once. We only refresh this
    // when the project changes (see effect below) — pagination doesn't reset
    // expectingFreshDefaultRef, so paging keeps the original default.
    if (expectingFreshDefaultRef.current) {
      setRightGraphDefault(experiments[0])
      expectingFreshDefaultRef.current = false
    }
  }, [])

  // When the active project changes, mark that the right-hand graph default
  // needs to be re-captured from the next experiments list to arrive.
  useEffect(() => {
    expectingFreshDefaultRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRightGraphDefault(null)
  }, [activeProject?.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPlateExperimentId(null)
    setPlateExperimentsList([])
  }, [activeProject?.id])

  const handleExperimentSetSelect = useCallback(async (setId: string) => {
    try {
      const token = await getToken()
      // Try batch endpoint first (single request for all experiment data)
      const batchRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiment-sets/${setId}/data/?max_points=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      console.log('[Dashboard] batch response status:', batchRes.status)
      if (batchRes.ok) {
        const data = await batchRes.json()
        console.log('[Dashboard] batch data:', { experimentCount: data.experiments?.length, hypothesis: data.hypothesis })
        const setExps: Experiment[] = data.experiments.map((e: { experiment: Experiment }) => ({
          id: e.experiment.id,
          title: e.experiment.title,
          description: e.experiment.description || '',
          benchmark: e.experiment.benchmark || '',
          created_at: e.experiment.created_at || '',
          updated_at: e.experiment.updated_at || '',
        }))
        setOverlayPreselected(setExps)
        setSelectedSetData({
          experiments: setExps,
          hypothesis: data.hypothesis || '',
          conclusion: data.conclusion || '',
          batchData: data.experiments,
        })
        setIsQuickGraphOpen(true)
        setIsOverlayOpen(true)
        return
      }

      console.log('[Dashboard] batch failed, falling back to metadata-only fetch')
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiment-sets/${setId}/`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) return
      const data = await res.json()
      const setExps: Experiment[] = data.experiments.map((e: { id: number; title: string }) => ({
        id: e.id,
        title: e.title,
        description: '',
        benchmark: '',
        created_at: '',
        updated_at: '',
      }))
      setOverlayPreselected(setExps)
      setSelectedSetData({
        experiments: setExps,
        hypothesis: data.hypothesis || '',
        conclusion: data.conclusion || '',
      })
      setIsQuickGraphOpen(true)
      setIsOverlayOpen(true)
    } catch (err) {
      console.error('Error fetching experiment set:', err)
    }
  }, [getToken])

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
              onExperimentSetSelect={handleExperimentSetSelect}
              isMobileDrawer={true}
              section={section}
              onSectionChange={setSection}
              onPlateExperimentSelect={setSelectedPlateExperimentId}
              selectedPlateExperimentId={selectedPlateExperimentId}
              onPlateExperimentsChange={setPlateExperimentsList}
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
              onExperimentSetSelect={handleExperimentSetSelect}
              section={section}
              onSectionChange={setSection}
              onPlateExperimentSelect={setSelectedPlateExperimentId}
              selectedPlateExperimentId={selectedPlateExperimentId}
              onPlateExperimentsChange={setPlateExperimentsList}
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

            {section === 'reactor' && (
              <>
                <CollapsibleSection
                  title="Quick Graph"
                  isOpen={isQuickGraphOpen}
                  onToggle={() => setIsQuickGraphOpen(!isQuickGraphOpen)}
                >
                  <QuickView
                    selectedExperiment={selectedExperiment}
                    onExperimentSelect={handleExperimentSelect}
                    experiments={experiments}
                    experimentSetData={selectedSetData}
                    rightGraphDefault={rightGraphDefault}
                    resetKey={activeProject?.id ?? null}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Overlay"
                  isOpen={isOverlayOpen}
                  onToggle={() => setIsOverlayOpen(!isOverlayOpen)}
                >
                  <Overlay experiments={experiments} preselectedExperiments={overlayPreselected} />
                </CollapsibleSection>
              </>
            )}

            {section === 'plates' && (
              <CollapsibleSection
                title="Results"
                isOpen={isResultsOpen}
                onToggle={() => setIsResultsOpen(!isResultsOpen)}
              >
                <Results plateExperimentId={selectedPlateExperimentId} />
              </CollapsibleSection>
            )}

            <CollapsibleSection
              title="Analysis"
              isOpen={isVariableImpactOpen}
              onToggle={() => setIsVariableImpactOpen(!isVariableImpactOpen)}
            >
              <Link
                href="/dashboard/analysis"
                className="block rounded-md border border-gray-200 bg-white p-6 hover:border-[#eb5234] transition-colors"
              >
                <div className="font-medium text-gray-900 mb-1">
                  Variable Analysis
                </div>
                <div className="text-sm text-gray-500">
                  Pick a cohort, choose an outcome, and run kinetic, DoE, and impact analyses.
                </div>
                <div className="mt-3 text-sm text-[#eb5234] font-medium">
                  Open Variable Analysis →
                </div>
              </Link>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </div>
  )
}
