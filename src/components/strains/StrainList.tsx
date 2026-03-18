'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'

interface Strain {
  name: string
  experiment_count: number
}

type SortOption = 'name-asc' | 'experiments-desc' | 'experiments-asc'

interface StrainListProps {
  onStrainSelect: (name: string) => void
  selectedStrain: string | null
  isMobileDrawer?: boolean
  strains: Strain[]
}

const PAGE_SIZE = 15

export function StrainList({ onStrainSelect, selectedStrain, isMobileDrawer = false, strains }: StrainListProps) {
  const [filterText, setFilterText] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('name-asc')
  const [sortOpen, setSortOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const sortRef = useRef<HTMLDivElement>(null)

  // Close sort dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Filtered and sorted strains
  const processedStrains = useMemo(() => {
    let result = [...strains]

    // Filter
    if (filterText.trim()) {
      const lower = filterText.toLowerCase()
      result = result.filter(s => s.name.toLowerCase().includes(lower))
    }

    // Sort
    switch (sortOption) {
      case 'name-asc':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'experiments-desc':
        result.sort((a, b) => b.experiment_count - a.experiment_count)
        break
      case 'experiments-asc':
        result.sort((a, b) => a.experiment_count - b.experiment_count)
        break
    }

    return result
  }, [strains, filterText, sortOption])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(processedStrains.length / PAGE_SIZE))
  const paginatedStrains = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return processedStrains.slice(start, start + PAGE_SIZE)
  }, [processedStrains, currentPage])

  // Reset to page 1 when filter/sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filterText, sortOption])

  // Auto-select first strain if none selected
  useEffect(() => {
    if (!selectedStrain && processedStrains.length > 0) {
      onStrainSelect(processedStrains[0].name)
    }
  }, [processedStrains, selectedStrain, onStrainSelect])

  const sortLabels: Record<SortOption, string> = {
    'name-asc': 'Name A-Z',
    'experiments-desc': 'Most experiments',
    'experiments-asc': 'Fewest experiments',
  }

  return (
    <div className={`w-full pt-4 pb-2 px-4 overflow-visible bg-white rounded-lg shadow ${
      isMobileDrawer ? 'h-full border-0 shadow-none' : ''
    }`}>
      <div className="pb-4">
        <h2 className="text-left text-xl md:text-2xl font-bold">Strains</h2>
        <div className="flex gap-2 mt-4">
          {/* Filter input */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Filter by name..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative" ref={sortRef}>
            <button
              className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              onClick={() => setSortOpen(!sortOpen)}
            >
              Sort
            </button>
            {sortOpen && (
              <div className="absolute top-full right-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
                {(Object.entries(sortLabels) as [SortOption, string][]).map(([key, label]) => (
                  <div
                    key={key}
                    className={`px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer ${
                      sortOption === key ? 'bg-blue-50 font-medium' : ''
                    }`}
                    onClick={() => { setSortOption(key); setSortOpen(false) }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Active sort indicator */}
        {sortOption !== 'name-asc' && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
              Sorted by: {sortLabels[sortOption]}
            </span>
          </div>
        )}
      </div>

      <div className="px-0 pb-4 overflow-y-auto flex-1">
        {processedStrains.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">No strains found</div>
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedStrains.map(strain => (
              <div
                key={strain.name}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedStrain === strain.name
                    ? 'bg-blue-100 border-blue-300'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => onStrainSelect(strain.name)}
              >
                <h4 className="font-medium">{strain.name}</h4>
                <p className="text-sm text-gray-600 mt-1">
                  {strain.experiment_count} experiment{strain.experiment_count !== 1 ? 's' : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {processedStrains.length > PAGE_SIZE && (
          <>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                className="h-8 px-3 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all disabled:opacity-50 disabled:pointer-events-none"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 3) {
                    pageNum = i + 1
                  } else if (currentPage <= 2) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 1) {
                    pageNum = totalPages - 2 + i
                  } else {
                    pageNum = currentPage - 1 + i
                  }
                  if (pageNum < 1 || pageNum > totalPages) return null
                  return (
                    <button
                      key={pageNum}
                      className={`min-w-[40px] h-8 px-3 rounded-md text-sm font-medium shadow-xs transition-all ${
                        currentPage === pageNum
                          ? 'bg-gray-900 text-white'
                          : 'border border-gray-200 hover:bg-gray-100'
                      }`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>

              <button
                className="h-8 px-3 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all disabled:opacity-50 disabled:pointer-events-none"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>

            <div className="text-center text-sm text-gray-600 mt-2">
              Page {currentPage} of {totalPages} &bull; {processedStrains.length} strains
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default StrainList
