'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'

interface Media {
  id: number
  name: string
  media_type: 'defined' | 'complex'
  project: number | null
  created_at: string
  updated_at: string
}

interface ApiResponse {
  media: {
    current_page: number
    total_pages: number
    total_media: number
    has_next: boolean
    has_previous: boolean
    media: Media[]
  }
}

interface MediaListProps {
  onMediaSelect?: (media: Media) => void
  isMobileDrawer?: boolean
  refreshKey?: number
}

type SortBy = 'name' | 'date'
type SortOrder = 'asc' | 'desc'

export const MediaList = ({ onMediaSelect, isMobileDrawer = false, refreshKey }: MediaListProps) => {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()

  const [media, setMedia] = useState<Media[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  const [activeFilters, setActiveFilters] = useState<{
    media_type?: 'defined' | 'complex'
    keyword?: string
  }>({})

  const [currentSortBy, setCurrentSortBy] = useState<SortBy | null>(null)
  const [currentSortOrder, setCurrentSortOrder] = useState<SortOrder | null>(null)

  // Dropdown state
  const [filterMenu, setFilterMenu] = useState(false)
  const [typeMenu, setTypeMenu] = useState(false)
  const [keywordMenu, setKeywordMenu] = useState(false)
  const [sortMenu, setSortMenu] = useState(false)
  const [nameSortMenu, setNameSortMenu] = useState(false)
  const [dateSortMenu, setDateSortMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const typeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const keywordTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const nameSortTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dateSortTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isFetchingRef = useRef(false)

  const clearAllTimeouts = () => {
    if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current)
    if (keywordTimeoutRef.current) clearTimeout(keywordTimeoutRef.current)
    if (nameSortTimeoutRef.current) clearTimeout(nameSortTimeoutRef.current)
    if (dateSortTimeoutRef.current) clearTimeout(dateSortTimeoutRef.current)
  }

  const setMenuWithDelay = (setter: (value: boolean) => void, timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>, delay: number = 1000) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setter(false)
      timeoutRef.current = null
    }, delay)
  }

  const fetchMedia = async (
    page: number,
    filters: typeof activeFilters,
    sortBy?: SortBy | null,
    sortOrder?: SortOrder | null,
  ) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsLoading(true)
    setHasError(false)
    try {
      const token = await getToken()
      const params = new URLSearchParams()
      params.append('page', page.toString())
      if (activeProject) params.append('project_id', activeProject.id.toString())
      if (filters.media_type) params.append('media_type', filters.media_type)
      if (filters.keyword) params.append('keyword', filters.keyword)
      if (sortBy) params.append('sort_by', sortBy)
      if (sortOrder) params.append('sort_order', sortOrder)

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/media/?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) throw new Error('Failed to fetch media')
      const data: ApiResponse = await res.json()

      if (!data.media || data.media.media.length === 0) {
        setMedia([])
        setTotalPages(1)
        setHasError(true)
      } else {
        setMedia(data.media.media)
        setTotalPages(data.media.total_pages)
        setHasError(false)
      }
    } catch (err) {
      console.error('Error fetching media:', err)
      setMedia([])
      setTotalPages(1)
      setHasError(true)
    } finally {
      isFetchingRef.current = false
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMedia(currentPage, activeFilters, currentSortBy, currentSortOrder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentSortBy, currentSortOrder, activeFilters, activeProject, refreshKey])

  useEffect(() => {
    setCurrentPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSortBy, currentSortOrder, activeFilters, activeProject])

  useEffect(() => {
    return () => { clearAllTimeouts() }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        clearAllTimeouts()
        setFilterMenu(false)
        setSortMenu(false)
        setTypeMenu(false)
        setKeywordMenu(false)
        setNameSortMenu(false)
        setDateSortMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => { document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  const applyTypeFilter = (mediaType: 'defined' | 'complex') => {
    clearAllTimeouts()
    setActiveFilters({ ...activeFilters, media_type: mediaType })
    setFilterMenu(false)
  }

  const applyKeyword = (keyword: string) => {
    if (!keyword) return
    clearAllTimeouts()
    setActiveFilters({ ...activeFilters, keyword })
    setFilterMenu(false)
  }

  const applySort = (sortBy: SortBy, sortOrder: SortOrder) => {
    clearAllTimeouts()
    setCurrentSortBy(sortBy)
    setCurrentSortOrder(sortOrder)
    setSortMenu(false)
    setNameSortMenu(false)
    setDateSortMenu(false)
  }

  const clearAll = () => {
    clearAllTimeouts()
    setActiveFilters({})
    setCurrentSortBy(null)
    setCurrentSortOrder(null)
    setFilterMenu(false)
    setSortMenu(false)
    setTypeMenu(false)
    setKeywordMenu(false)
    setNameSortMenu(false)
    setDateSortMenu(false)
  }

  const hasActiveFilters = !!(activeFilters.media_type || activeFilters.keyword)

  return (
    <div className={`w-full pt-4 pb-2 px-4 overflow-visible bg-white rounded-lg shadow ${
      isMobileDrawer ? 'h-full border-0 shadow-none' : ''
    }`}>
      <div className="pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-left text-xl md:text-2xl font-bold">Media List</h2>
        </div>

        <div className="flex gap-2 mt-4 relative" ref={menuRef}>
          <div className="flex-1 relative">
            <button
              className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              onClick={() => { setFilterMenu(!filterMenu); setSortMenu(false) }}
            >
              Filter
            </button>

            {filterMenu && (
              <div className="absolute top-full left-0 w-auto min-w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
                {/* Type */}
                <div className="relative"
                  onMouseEnter={() => { clearAllTimeouts(); setTypeMenu(true); setKeywordMenu(false) }}
                  onMouseLeave={() => setMenuWithDelay(setTypeMenu, typeTimeoutRef)}
                >
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">type</div>
                  {typeMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applyTypeFilter('defined')}>
                        Defined
                      </div>
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applyTypeFilter('complex')}>
                        Complex
                      </div>
                    </div>
                  )}
                </div>

                {/* Keyword */}
                <div className="relative"
                  onMouseEnter={() => { clearAllTimeouts(); setKeywordMenu(true); setTypeMenu(false) }}
                  onMouseLeave={() => setMenuWithDelay(setKeywordMenu, keywordTimeoutRef)}
                >
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">keyword</div>
                  {keywordMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      <div className="p-3">
                        <input
                          type="text"
                          placeholder="Enter keyword..."
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const keyword = e.currentTarget.value.trim()
                              if (keyword) applyKeyword(keyword)
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 relative">
            <button
              className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              onClick={() => { setSortMenu(!sortMenu); setFilterMenu(false) }}
            >
              Sort
            </button>

            {sortMenu && (
              <div className="absolute top-full left-0 w-auto min-w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
                <div className="relative"
                  onMouseEnter={() => { clearAllTimeouts(); setNameSortMenu(true); setDateSortMenu(false) }}
                  onMouseLeave={() => setMenuWithDelay(setNameSortMenu, nameSortTimeoutRef)}
                >
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Name</div>
                  {nameSortMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applySort('name', 'asc')}>A–Z</div>
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applySort('name', 'desc')}>Z–A</div>
                    </div>
                  )}
                </div>

                <div className="relative"
                  onMouseEnter={() => { clearAllTimeouts(); setDateSortMenu(true); setNameSortMenu(false) }}
                  onMouseLeave={() => setMenuWithDelay(setDateSortMenu, dateSortTimeoutRef)}
                >
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Date created</div>
                  {dateSortMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applySort('date', 'desc')}>Newest first</div>
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applySort('date', 'asc')}>Oldest first</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 relative">
            <button
              className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              onClick={clearAll}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mt-4">
            {activeFilters.media_type && (
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full flex items-center gap-1">
                Type: {activeFilters.media_type}
                <button
                  className="ml-1 hover:text-blue-600"
                  onClick={() => setActiveFilters({ ...activeFilters, media_type: undefined })}
                >x</button>
              </span>
            )}
            {activeFilters.keyword && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full flex items-center gap-1">
                Keyword: {activeFilters.keyword}
                <button
                  className="ml-1 hover:text-yellow-700"
                  onClick={() => setActiveFilters({ ...activeFilters, keyword: undefined })}
                >x</button>
              </span>
            )}
          </div>
        )}

        {/* Current sort pill */}
        {currentSortBy && currentSortOrder && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
              Sorted by: {currentSortBy === 'name' ? 'Name' : 'Date'}{' '}
              ({currentSortBy === 'name'
                ? (currentSortOrder === 'asc' ? 'A–Z' : 'Z–A')
                : (currentSortOrder === 'desc' ? 'Newest first' : 'Oldest first')})
            </span>
          </div>
        )}
      </div>

      <div className="px-0 pb-4 overflow-y-auto flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading media...</div>
          </div>
        ) : hasError || media.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">No media available here</div>
          </div>
        ) : (
          <div className="space-y-2">
            {media.map((m) => (
              <div
                key={m.id}
                className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onMediaSelect?.(m)}
              >
                <h4 className="font-medium">{m.name}</h4>
                <p className="text-sm text-gray-600 mt-1 line-clamp-1 capitalize">{m.media_type}</p>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !hasError && media.length > 0 && totalPages > 1 && (
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
                if (totalPages <= 3) pageNum = i + 1
                else if (currentPage <= 2) pageNum = i + 1
                else if (currentPage >= totalPages - 1) pageNum = totalPages - 2 + i
                else pageNum = currentPage - 1 + i
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
        )}

        {!isLoading && !hasError && media.length > 0 && totalPages > 1 && (
          <div className="text-center text-sm text-gray-600 mt-2">
            Page {currentPage} of {totalPages} • {media.length} media
          </div>
        )}
      </div>
    </div>
  )
}

export default MediaList
