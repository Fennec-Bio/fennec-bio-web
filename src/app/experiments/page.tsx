'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ExperimentList } from '@/components/Shared/ExperimentList'
import { CreateExperiment } from '@/components/experiments/CreateExperiment'
import { EditExperiment } from '@/components/experiments/EditExperiment'
import { ManageExperimentSets } from '@/components/experiments/ManageExperimentSets'
import { DataTemplates } from '@/components/experiments/DataTemplates'
import { CreatePlateExperiment } from '@/components/Plate/CreatePlateExperiment'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

export default function ExperimentsPage() {
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(true)
  const [isEditOpen, setIsEditOpen] = useState(true)
  const [isSetsOpen, setIsSetsOpen] = useState(true)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(true)
  const [listRefreshKey, setListRefreshKey] = useState(0)
  const [newType, setNewType] = useState<'fermentation' | 'plate' | null>(null)

  const handleExperimentSelect = useCallback((experiment: Experiment) => {
    setSelectedExperiment(experiment)
    setIsEditOpen(true)
    setIsMobileMenuOpen(false)
  }, [])

  const handleExperimentSetSelect = useCallback((setId: string) => {
    setSelectedSetId(setId)
    setIsSetsOpen(true)
  }, [])

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Mobile drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[85%] max-w-[320px] bg-white overflow-y-auto shadow-xl">
            <ExperimentList
              onExperimentSelect={handleExperimentSelect}
              onExperimentSetSelect={handleExperimentSetSelect}
              refreshKey={listRefreshKey}
              isMobileDrawer
            />
          </div>
        </div>
      )}

      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        {/* Mobile toggle */}
        <button
          className="md:hidden mb-3 h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          Experiments
        </button>

        <div className="flex flex-row gap-3 md:gap-5 lg:gap-6">
          {/* Desktop sidebar */}
          <div className="hidden md:block w-[364px] min-w-[364px] max-w-[416px] flex-shrink-0 relative z-30">
            <ExperimentList
              onExperimentSelect={handleExperimentSelect}
              onExperimentSetSelect={handleExperimentSetSelect}
              refreshKey={listRefreshKey}
            />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 md:gap-5">
            <div className="bg-white rounded-lg shadow">
              <button
                onClick={() => {
                  const nextOpen = !isCreateOpen
                  setIsCreateOpen(nextOpen)
                  if (!nextOpen) setNewType(null)
                }}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xl md:text-2xl font-bold text-gray-900 hover:bg-gray-50 rounded-t-lg"
              >
                <span>Create Experiment</span>
                {isCreateOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
              </button>
              {isCreateOpen && (
                <div className="p-3 md:p-4 lg:p-6">
                  {newType === null && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setNewType('fermentation')}
                        className="text-left p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 hover:shadow-md transition-shadow"
                      >
                        <div className="font-semibold text-gray-900 mb-1">Fermentation Experiment</div>
                        <div className="text-sm text-gray-500">Bioreactor run with time-series products, secondary products, and process data.</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewType('plate')}
                        className="text-left p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 hover:shadow-md transition-shadow"
                      >
                        <div className="font-semibold text-gray-900 mb-1">Plate Experiment</div>
                        <div className="text-sm text-gray-500">96- or 384-well screen with per-well conditions and endpoint measurements.</div>
                      </button>
                    </div>
                  )}

                  {newType === 'fermentation' && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setNewType(null)}
                        className="text-sm text-gray-500 hover:text-gray-900"
                      >
                        ← Change type
                      </button>
                      <CreateExperiment onCreated={() => setListRefreshKey(k => k + 1)} />
                    </div>
                  )}

                  {newType === 'plate' && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setNewType(null)}
                        className="text-sm text-gray-500 hover:text-gray-900"
                      >
                        ← Change type
                      </button>
                      <CreatePlateExperiment
                        onCreated={() => setListRefreshKey(k => k + 1)}
                        onCancel={() => setNewType(null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow">
              <button
                onClick={() => setIsEditOpen(!isEditOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xl md:text-2xl font-bold text-gray-900 hover:bg-gray-50 rounded-t-lg"
              >
                <span>Edit Experiment</span>
                {isEditOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
              </button>
              {isEditOpen && (
                <div>
                  <EditExperiment selectedExperiment={selectedExperiment} />
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow">
              <button
                onClick={() => setIsSetsOpen(!isSetsOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xl md:text-2xl font-bold text-gray-900 hover:bg-gray-50 rounded-t-lg"
              >
                <span>Experiment Sets</span>
                {isSetsOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
              </button>
              {isSetsOpen && (
                <div className="p-3 md:p-4 lg:p-6">
                  <ManageExperimentSets externalSelectedSetId={selectedSetId} />
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow">
              <button
                onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xl md:text-2xl font-bold text-gray-900 hover:bg-gray-50 rounded-t-lg"
              >
                <span>Data Templates</span>
                {isTemplatesOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
              </button>
              {isTemplatesOpen && (
                <div className="p-3 md:p-4 lg:p-6">
                  <DataTemplates />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
