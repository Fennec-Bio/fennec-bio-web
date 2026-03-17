'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '@clerk/nextjs'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { StrainList } from '@/components/strains/StrainList'
import { AddStrain } from '@/components/strains/AddStrain'
import { EditStrain } from '@/components/strains/EditStrain'
import { StrainStats } from '@/components/strains/StrainStats'
import { StrainLineageChart } from '@/components/strains/StrainLineageChart'

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
        {isOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  )
}

export default function StrainsPage() {
  const { getToken } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isStrainSectionOpen, setIsStrainSectionOpen] = useState(true)
  const [isLineageOpen, setIsLineageOpen] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedStrain, setSelectedStrain] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'edit' | 'add'>('edit')
  const [lineageData, setLineageData] = useState<StrainLineageData[]>([])

  // Fetch lineage data (shared between StrainStats and EditStrain)
  useEffect(() => {
    let cancelled = false
    const fetchLineage = async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/strain-lineage/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setLineageData(data.strains || [])
        }
      } catch (err) {
        console.error('Error fetching lineage data:', err)
      }
    }
    fetchLineage()
    return () => { cancelled = true }
  }, [refreshKey, getToken])

  // Auto-switch tab based on selection
  useEffect(() => {
    setActiveTab(selectedStrain ? 'edit' : 'add')
  }, [selectedStrain])

  const selectedStrainData = useMemo(
    () => (selectedStrain ? lineageData.find(s => s.name === selectedStrain) ?? null : null),
    [lineageData, selectedStrain]
  )

  const handleStrainChanged = useCallback(() => {
    setRefreshKey(prev => prev + 1)
  }, [])

  const handleStrainSelect = useCallback((name: string) => {
    setSelectedStrain(prev => prev === name ? null : name)
    setIsMobileMenuOpen(false)
  }, [])

  const sectionTitle = activeTab === 'edit' && selectedStrain
    ? `Edit Strain: ${selectedStrain}`
    : 'Add Strain'

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Mobile drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[85%] max-w-[320px] bg-white overflow-y-auto shadow-xl">
            <StrainList
              isMobileDrawer
              onStrainSelect={handleStrainSelect}
              selectedStrain={selectedStrain}
              refreshKey={refreshKey}
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
          Strains
        </button>

        <div className="flex flex-row gap-3 md:gap-5 lg:gap-6">
          {/* Desktop sidebar */}
          <div className="hidden md:block w-[364px] min-w-[364px] max-w-[416px] flex-shrink-0 relative z-50">
            <StrainList
              key={refreshKey}
              onStrainSelect={handleStrainSelect}
              selectedStrain={selectedStrain}
              refreshKey={refreshKey}
            />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 md:gap-5">
            <CollapsibleSection
              title={sectionTitle}
              isOpen={isStrainSectionOpen}
              onToggle={() => setIsStrainSectionOpen(!isStrainSectionOpen)}
            >
              {/* Tabs */}
              <div className="flex border-b px-4">
                <button
                  onClick={() => setActiveTab('edit')}
                  disabled={!selectedStrain}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'edit'
                      ? 'border-[#eb5234] text-[#eb5234]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } ${!selectedStrain ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  Edit Strain
                </button>
                <button
                  onClick={() => setActiveTab('add')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'add'
                      ? 'border-[#eb5234] text-[#eb5234]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Add Strain
                </button>
              </div>

              <div className="p-4">
                {activeTab === 'edit' && selectedStrain ? (
                  <EditStrain
                    strainName={selectedStrain}
                    strainData={selectedStrainData}
                    onStrainUpdated={handleStrainChanged}
                  />
                ) : (
                  <AddStrain onStrainAdded={handleStrainChanged} />
                )}
              </div>
            </CollapsibleSection>

            {selectedStrain && (
              <StrainStats
                strainName={selectedStrain}
                lineageData={lineageData}
                onSelectStrain={handleStrainSelect}
              />
            )}

            <CollapsibleSection
              title="Strain Lineage"
              isOpen={isLineageOpen}
              onToggle={() => setIsLineageOpen(!isLineageOpen)}
            >
              <div className="min-h-[500px]">
                <StrainLineageChart
                  key={refreshKey}
                  selectedStrain={selectedStrain}
                  refreshKey={refreshKey}
                />
              </div>
            </CollapsibleSection>
          </div>
        </div>
      </div>
    </div>
  )
}
