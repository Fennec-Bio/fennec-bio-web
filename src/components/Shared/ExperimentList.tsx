'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

interface ApiResponse {
  experiments: {
    current_page: number
    total_pages: number
    total_experiments: number
    has_next: boolean
    has_previous: boolean
    experiments: Experiment[]
  }
}

interface UniqueNamesResponse {
  products: string[]
  secondary_products: string[]
  process_data: string[]
  variables: { [key: string]: string[] }
  events: string[]
  anomalies: string[]
}

interface ExperimentSetData {
  id: string
  name: string
  experiments: { id: number; title: string; benchmark?: boolean }[]
}

interface ExperimentListProps {
  onExperimentSelect?: (experiment: Experiment) => void
  onExperimentsChange?: (experiments: Experiment[]) => void
  onExperimentSetSelect?: (setId: string) => void
  isMobileDrawer?: boolean
}

export const ExperimentList = ({ onExperimentSelect, onExperimentsChange, onExperimentSetSelect, isMobileDrawer = false }: ExperimentListProps) => {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()

  const [uniqueNames, setUniqueNames] = useState<{
    products: string[]
    secondary_products: string[]
    process_data: string[]
    variables: { [key: string]: string[] }
    events: string[]
    anomalies: string[]
  }>({
    products: [],
    secondary_products: [],
    process_data: [],
    variables: {},
    events: [],
    anomalies: []
  })

  const [viewMode, setViewMode] = useState<'experiments' | 'sets'>('experiments')
  const [experimentSets, setExperimentSets] = useState<ExperimentSetData[]>([])
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set())
  const [setsLoading, setSetsLoading] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [uniqueNamesLoading, setUniqueNamesLoading] = useState(true)

  // Filter state variables
  const [activeFilters, setActiveFilters] = useState<{
    variables?: { name: string; value: string }[]
    anomaly_name?: string
    event_name?: string
    keyword?: string
    has_anomaly?: string
  }>({})

  // Filter dropdown variables
  const [filterMenu, setFilterMenu] = useState(false)
  const [variablesMenu, setVariablesMenu] = useState(false)
  const [anomaliesMenu, setAnomaliesMenu] = useState(false)
  const [eventsMenu, setEventsMenu] = useState(false)
  const [keywordMenu, setKeywordMenu] = useState(false)
  const [variableValuesMenu, setVariableValuesMenu] = useState<string | null>(null)

  // Sort dropdown variables
  const [sortMenu, setSortMenu] = useState(false)
  const [productsMenu, setProductsMenu] = useState(false)
  const [secondaryProductsMenu, setSecondaryProductsMenu] = useState(false)
  const [activeSortItem, setActiveSortItem] = useState<string | null>(null)
  const [currentSortBy, setCurrentSortBy] = useState<string | null>(null)
  const [currentSortOrder, setCurrentSortOrder] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isFetchingRef = useRef(false)

  const sortItems = (items: string[]): string[] => {
    return items.sort((a, b) => {
      const aNum = parseFloat(a)
      const bNum = parseFloat(b)
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
      return a.toLowerCase().localeCompare(b.toLowerCase())
    })
  }

  // Timeout refs for delayed menu closing
  const variablesTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const anomaliesTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const eventsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const keywordTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const productsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const secondaryProductsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const variableValuesTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearAllTimeouts = () => {
    if (variablesTimeoutRef.current) clearTimeout(variablesTimeoutRef.current)
    if (anomaliesTimeoutRef.current) clearTimeout(anomaliesTimeoutRef.current)
    if (eventsTimeoutRef.current) clearTimeout(eventsTimeoutRef.current)
    if (keywordTimeoutRef.current) clearTimeout(keywordTimeoutRef.current)
    if (productsTimeoutRef.current) clearTimeout(productsTimeoutRef.current)
    if (secondaryProductsTimeoutRef.current) clearTimeout(secondaryProductsTimeoutRef.current)
    if (variableValuesTimeoutRef.current) clearTimeout(variableValuesTimeoutRef.current)
  }

  const setMenuWithDelay = (setter: (value: boolean) => void, timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>, delay: number = 1000) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setter(false)
      timeoutRef.current = null
    }, delay)
  }

  const setVariableValuesMenuWithDelay = (value: string | null, delay: number = 1000) => {
    if (variableValuesTimeoutRef.current) clearTimeout(variableValuesTimeoutRef.current)
    variableValuesTimeoutRef.current = setTimeout(() => {
      setVariableValuesMenu(null)
      variableValuesTimeoutRef.current = null
    }, delay)
  }

  const fetchExperimentSets = useCallback(async () => {
    setSetsLoading(true)
    try {
      const token = await getToken()
      const params = new URLSearchParams()
      if (activeProject) params.append('project', activeProject.id.toString())
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiment-sets/?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        setExperimentSets(await res.json())
      }
    } catch (err) {
      console.error('Error fetching experiment sets:', err)
    } finally {
      setSetsLoading(false)
    }
  }, [activeProject, getToken])

  useEffect(() => {
    if (viewMode === 'sets') {
      fetchExperimentSets()
    }
  }, [viewMode, fetchExperimentSets, activeProject])

  const toggleSetExpanded = (setId: string) => {
    setExpandedSets(prev => {
      const next = new Set(prev)
      if (next.has(setId)) next.delete(setId)
      else next.add(setId)
      return next
    })
  }

  // Fetch unique names once when project changes (separate from experiment list)
  useEffect(() => {
    const fetchUniqueNames = async () => {
      setUniqueNamesLoading(true)
      try {
        const token = await getToken()
        const params = new URLSearchParams()
        if (activeProject) params.append('project_id', activeProject.id.toString())
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/uniqueNames/?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) return
        const data: UniqueNamesResponse = await response.json()
        setUniqueNames(data)
      } catch (err) {
        console.error('Error fetching unique names:', err)
      } finally {
        setUniqueNamesLoading(false)
      }
    }
    fetchUniqueNames()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject])

  useEffect(() => {
    setCurrentPage(1)
    fetchExperiments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentSortBy, currentSortOrder, activeFilters, activeProject])

  useEffect(() => {
    if (experiments.length > 0 && onExperimentSelect) {
      onExperimentSelect(experiments[0])
    }
  }, [experiments, onExperimentSelect])

  useEffect(() => {
    return () => { clearAllTimeouts() }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        clearAllTimeouts()
        setFilterMenu(false)
        setSortMenu(false)
        setVariablesMenu(false)
        setAnomaliesMenu(false)
        setEventsMenu(false)
        setKeywordMenu(false)
        setVariableValuesMenu(null)
        setProductsMenu(false)
        setSecondaryProductsMenu(false)
        setActiveSortItem(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => { document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  const applyFilter = (filterType: string, filterValue: string, subValue?: string) => {
    clearAllTimeouts()
    const newFilters = { ...activeFilters }
    switch (filterType) {
      case 'variable': {
        const existing = newFilters.variables || []
        // Don't add duplicate variable filters
        const alreadyExists = existing.some(v => v.name === filterValue && v.value === (subValue || ''))
        if (!alreadyExists) {
          newFilters.variables = [...existing, { name: filterValue, value: subValue || '' }]
        }
        break
      }
      case 'anomaly':
        if (filterValue === 'anomalies_only') {
          newFilters.has_anomaly = 'true'
          newFilters.anomaly_name = undefined
        } else {
          newFilters.anomaly_name = filterValue
          newFilters.has_anomaly = undefined
        }
        break
      case 'event':
        newFilters.event_name = filterValue
        break
      case 'keyword':
        newFilters.keyword = filterValue
        break
    }
    setActiveFilters(newFilters)
    setCurrentPage(1)
    setFilterMenu(false)
    fetchExperimentsWithPage(1, newFilters, currentSortBy || undefined, currentSortOrder || undefined)
  }

  const clearFilters = () => {
    clearAllTimeouts()
    setActiveFilters({})
    setCurrentPage(1)
    setFilterMenu(false)
    setSortMenu(false)
    setVariablesMenu(false)
    setAnomaliesMenu(false)
    setEventsMenu(false)
    setKeywordMenu(false)
    setVariableValuesMenu(null)
    setProductsMenu(false)
    setSecondaryProductsMenu(false)
    setActiveSortItem(null)
    setCurrentSortBy(null)
    setCurrentSortOrder(null)
    fetchExperimentsWithPage(1, {})
  }

  const applySort = (sortBy: string, sortOrder: string) => {
    clearAllTimeouts()
    setCurrentSortBy(sortBy)
    setCurrentSortOrder(sortOrder)
    setCurrentPage(1)
    setSortMenu(false)
    setProductsMenu(false)
    setSecondaryProductsMenu(false)
    setActiveSortItem(null)
    fetchExperimentsWithPage(1, activeFilters, sortBy, sortOrder)
  }

  const fetchExperimentsWithPage = async (page: number, filters: typeof activeFilters, sortBy?: string, sortOrder?: string) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsLoading(true)
    setHasError(false)

    try {
      const token = await getToken()
      const params = new URLSearchParams()
      params.append('page', page.toString())

      if (activeProject) params.append('project_id', activeProject.id.toString())
      if (filters.variables && filters.variables.length > 0) {
        params.append('variables', filters.variables.map(v => `${v.name}:${v.value}`).join(','))
      }
      if (filters.anomaly_name) params.append('anomaly_name', filters.anomaly_name)
      if (filters.has_anomaly) params.append('has_anomaly', filters.has_anomaly)
      if (filters.event_name) params.append('event_name', filters.event_name)
      if (filters.keyword) params.append('keyword', filters.keyword)
      if (sortBy) params.append('sort_by', sortBy)
      if (sortOrder) params.append('sort_order', sortOrder)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/experimentList/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Failed to fetch experiments')
      const data: ApiResponse = await response.json()

      if (!data.experiments || !data.experiments.experiments || data.experiments.experiments.length === 0) {
        setExperiments([])
        setTotalPages(1)
        setHasError(true)
      } else {
        setExperiments(data.experiments.experiments)
        setTotalPages(data.experiments.total_pages)
        setHasError(false)
      }

      if (onExperimentsChange) {
        onExperimentsChange(data.experiments?.experiments || [])
      }
    } catch (err) {
      console.error('Error fetching experiments:', err)
      setExperiments([])
      setTotalPages(1)
      setHasError(true)
    } finally {
      isFetchingRef.current = false
      setIsLoading(false)
    }
  }

  const fetchExperiments = async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setIsLoading(true)
    setHasError(false)

    try {
      const token = await getToken()
      const params = new URLSearchParams()
      params.append('page', currentPage.toString())

      if (activeProject) params.append('project_id', activeProject.id.toString())
      if (activeFilters.variables && activeFilters.variables.length > 0) {
        params.append('variables', activeFilters.variables.map(v => `${v.name}:${v.value}`).join(','))
      }
      if (activeFilters.anomaly_name) params.append('anomaly_name', activeFilters.anomaly_name)
      if (activeFilters.has_anomaly) params.append('has_anomaly', activeFilters.has_anomaly)
      if (activeFilters.event_name) params.append('event_name', activeFilters.event_name)
      if (activeFilters.keyword) params.append('keyword', activeFilters.keyword)
      if (currentSortBy) params.append('sort_by', currentSortBy)
      if (currentSortOrder) params.append('sort_order', currentSortOrder)

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/experimentList/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Failed to fetch experiments')
      const data: ApiResponse = await response.json()

      if (!data.experiments || !data.experiments.experiments || data.experiments.experiments.length === 0) {
        setExperiments([])
        setTotalPages(1)
        setHasError(true)
      } else {
        setExperiments(data.experiments.experiments)
        setTotalPages(data.experiments.total_pages)
        setHasError(false)
      }

      if (onExperimentsChange) {
        onExperimentsChange(data.experiments?.experiments || [])
      }
    } catch (err) {
      console.error('Error fetching experiments:', err)
      setExperiments([])
      setTotalPages(1)
      setHasError(true)
    } finally {
      isFetchingRef.current = false
      setIsLoading(false)
    }
  }

  return (
    <div className={`w-full pt-4 pb-2 px-4 overflow-visible bg-white rounded-lg shadow ${
      isMobileDrawer ? 'h-full border-0 shadow-none' : ''
    }`}>
      <div className="pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-left text-xl md:text-2xl font-bold">
            {viewMode === 'experiments' ? 'Experiment List' : 'Experiment Sets'}
          </h2>
          <button
            onClick={() => setViewMode(viewMode === 'experiments' ? 'sets' : 'experiments')}
            className="h-8 px-3 border border-gray-200 rounded-md text-xs font-medium shadow-xs hover:bg-gray-100 transition-all"
          >
            {viewMode === 'experiments' ? 'View Sets' : 'View List'}
          </button>
        </div>
        {viewMode === 'experiments' && <><div className="flex gap-2 mt-4 relative" ref={menuRef}>
          <div className="flex-1 relative">
            <button
              className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              onClick={() => { setFilterMenu(!filterMenu); setSortMenu(false) }}
            >
              Filter
            </button>

            {filterMenu && (
              <div className="absolute top-full left-0 w-auto min-w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
                {/* Variables */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setVariablesMenu(true); setAnomaliesMenu(false); setEventsMenu(false); setKeywordMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                }} onMouseLeave={() => setMenuWithDelay(setVariablesMenu, variablesTimeoutRef)}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">variables</div>
                  {variablesMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      {Object.entries(uniqueNames.variables)
                        .sort(([a], [b]) => sortItems([a, b])[0] === a ? -1 : 1)
                        .map(([variableName, variableValues], index) => (
                          <div className="relative" onMouseEnter={() => {
                            clearAllTimeouts(); setVariableValuesMenu(variableName)
                          }} onMouseLeave={() => setVariableValuesMenuWithDelay(null)} key={index}>
                            <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{variableName}</div>
                            {variableValuesMenu === variableName && (
                              <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                                onMouseEnter={() => clearAllTimeouts()}
                                onMouseLeave={() => setVariableValuesMenuWithDelay(null)}>
                                {Array.isArray(variableValues) && sortItems([...variableValues]).map((value, valueIndex) => (
                                  <div key={valueIndex}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                    onClick={() => applyFilter('variable', variableName, value)}>
                                    {value}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Anomalies */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setAnomaliesMenu(true); setVariablesMenu(false); setEventsMenu(false); setKeywordMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                }} onMouseLeave={() => setMenuWithDelay(setAnomaliesMenu, anomaliesTimeoutRef)}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">anomalies</div>
                  {anomaliesMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      {sortItems([...uniqueNames.anomalies]).map((anomaly, index) => (
                        <div key={index}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                          onClick={() => applyFilter('anomaly', anomaly)}>
                          Remove Anomalies
                        </div>
                      ))}
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applyFilter('anomaly', 'anomalies_only')}>
                        Anomalies Only
                      </div>
                    </div>
                  )}
                </div>

                {/* Events */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setEventsMenu(true); setVariablesMenu(false); setAnomaliesMenu(false); setKeywordMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                }} onMouseLeave={() => setMenuWithDelay(setEventsMenu, eventsTimeoutRef)}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">events</div>
                  {eventsMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      {sortItems([...uniqueNames.events]).map((event, index) => (
                        <div key={index}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                          onClick={() => applyFilter('event', event)}>
                          {event}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Keyword */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setKeywordMenu(true); setVariablesMenu(false); setAnomaliesMenu(false); setEventsMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                }} onMouseLeave={() => setMenuWithDelay(setKeywordMenu, keywordTimeoutRef)}>
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
                              if (keyword) applyFilter('keyword', keyword)
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
                {/* Products */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setProductsMenu(true); setSecondaryProductsMenu(false); setActiveSortItem(null)
                  setVariablesMenu(false); setAnomaliesMenu(false); setEventsMenu(false); setKeywordMenu(false)
                }} onMouseLeave={() => setMenuWithDelay(setProductsMenu, productsTimeoutRef)}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Products</div>
                  {productsMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      {uniqueNamesLoading ? (
                        <div className="px-4 py-3 text-sm text-gray-400">Loading...</div>
                      ) : uniqueNames.products.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400">No products</div>
                      ) : null}
                      {sortItems([...uniqueNames.products]).map((product, index) => (
                        <div className="relative" onMouseEnter={() => setActiveSortItem(product)} onMouseLeave={() => setActiveSortItem(null)} key={index}>
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{product}</div>
                          {activeSortItem === product && (
                            <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg ml-1" style={{ zIndex: 9999 }}>
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`product_${product}`, 'desc')}>
                                Highest first
                              </div>
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`product_${product}`, 'asc')}>
                                Lowest first
                              </div>
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`product_${product}`, 'diff_desc')}>
                                Highest differential
                              </div>
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`product_${product}`, 'diff_asc')}>
                                Lowest differential
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Secondary Products */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setSecondaryProductsMenu(true); setProductsMenu(false); setActiveSortItem(null)
                  setVariablesMenu(false); setAnomaliesMenu(false); setEventsMenu(false); setKeywordMenu(false)
                }} onMouseLeave={() => setMenuWithDelay(setSecondaryProductsMenu, secondaryProductsTimeoutRef)}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Secondary Products</div>
                  {secondaryProductsMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      {uniqueNamesLoading ? (
                        <div className="px-4 py-3 text-sm text-gray-400">Loading...</div>
                      ) : uniqueNames.secondary_products.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400">No secondary products</div>
                      ) : null}
                      {sortItems([...uniqueNames.secondary_products]).map((sp, index) => (
                        <div className="relative" onMouseEnter={() => setActiveSortItem(sp)} onMouseLeave={() => setActiveSortItem(null)} key={index}>
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{sp}</div>
                          {activeSortItem === sp && (
                            <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`secondary_product_${sp}`, 'desc')}>
                                Highest first
                              </div>
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`secondary_product_${sp}`, 'asc')}>
                                Lowest first
                              </div>
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`secondary_product_${sp}`, 'diff_desc')}>
                                Highest differential
                              </div>
                              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applySort(`secondary_product_${sp}`, 'diff_asc')}>
                                Lowest differential
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setProductsMenu(false); setSecondaryProductsMenu(false)
                  setVariablesMenu(false); setAnomaliesMenu(false); setEventsMenu(false); setKeywordMenu(false)
                  setActiveSortItem('dated')
                }} onMouseLeave={() => {
                  if (productsTimeoutRef.current) clearTimeout(productsTimeoutRef.current)
                  productsTimeoutRef.current = setTimeout(() => setActiveSortItem(null), 1000)
                }}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Date</div>
                  {activeSortItem === 'dated' && (
                    <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applySort('date', 'desc')}>
                        Newest first
                      </div>
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applySort('date', 'asc')}>
                        Oldest first
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
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Active filters */}
        {(activeFilters.variables?.length || activeFilters.anomaly_name || activeFilters.has_anomaly || activeFilters.event_name || activeFilters.keyword) && (
          <div className="flex flex-wrap gap-2 mt-4">
            {activeFilters.variables?.map((v, i) => (
              <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full flex items-center gap-1">
                {v.name}{v.value && ` = ${v.value}`}
                <button
                  className="ml-1 hover:text-blue-600"
                  onClick={() => {
                    const newVars = activeFilters.variables!.filter((_, idx) => idx !== i)
                    const newFilters = { ...activeFilters, variables: newVars.length > 0 ? newVars : undefined }
                    setActiveFilters(newFilters)
                    setCurrentPage(1)
                    fetchExperimentsWithPage(1, newFilters, currentSortBy || undefined, currentSortOrder || undefined)
                  }}
                >
                  x
                </button>
              </span>
            ))}
            {activeFilters.anomaly_name && (
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                Anomalies Removed
              </span>
            )}
            {activeFilters.has_anomaly && (
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                {activeFilters.has_anomaly === 'true' ? 'Anomalies Only' : 'No Anomalies'}
              </span>
            )}
            {activeFilters.event_name && (
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                Event: {activeFilters.event_name}
              </span>
            )}
            {activeFilters.keyword && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                Keyword: {activeFilters.keyword}
              </span>
            )}
          </div>
        )}

        {/* Current sort */}
        {currentSortBy && currentSortOrder && (
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
              Sorted by: {currentSortBy === 'date' ? 'Date' : currentSortBy.replace('product_', '').replace('secondary_product_', '')}
              {' '}({currentSortOrder === 'desc' ? 'Highest first' : currentSortOrder === 'asc' ? 'Lowest first' : currentSortOrder === 'diff_desc' ? 'Highest differential' : 'Lowest differential'})
            </span>
          </div>
        )}
        </>}
      </div>

      {viewMode === 'experiments' ? (
        <div className="px-0 pb-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading experiments...</div>
            </div>
          ) : hasError || experiments.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">No experiments available here</div>
            </div>
          ) : (
            <div className="space-y-2">
              {experiments.map((experiment) => (
                <div
                  key={experiment.id}
                  className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onExperimentSelect?.(experiment)}
                >
                  <h4 className="font-medium">{experiment.title}</h4>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-1">{experiment.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && !hasError && experiments.length > 0 && totalPages > 1 && (
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
          )}

          {!isLoading && !hasError && experiments.length > 0 && totalPages > 1 && (
            <div className="text-center text-sm text-gray-600 mt-2">
              Page {currentPage} of {totalPages} • {experiments.length} experiments
            </div>
          )}
        </div>
      ) : (
        <div className="px-0 pb-4 overflow-y-auto flex-1">
          {setsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading experiment sets...</div>
            </div>
          ) : experimentSets.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">No experiment sets in this project</div>
            </div>
          ) : (
            <div className="space-y-2">
              {experimentSets.map((set) => (
                <div key={set.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    onClick={() => { toggleSetExpanded(set.id); onExperimentSetSelect?.(set.id) }}
                  >
                    <div className="flex items-center gap-2">
                      {expandedSets.has(set.id) ? (
                        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                      <h4 className="font-medium text-left">{set.name}</h4>
                    </div>
                    <span className="text-xs text-gray-500">{set.experiments.length} exp</span>
                  </button>
                  {expandedSets.has(set.id) && (
                    <div className="border-t border-gray-200">
                      {set.experiments.length === 0 ? (
                        <p className="px-4 py-2 text-sm text-gray-500">No experiments in this set</p>
                      ) : (
                        set.experiments.map((exp) => (
                          <div
                            key={exp.id}
                            className="px-4 py-2 pl-9 hover:bg-gray-50 cursor-pointer transition-colors text-sm border-b border-gray-100 last:border-b-0"
                            onClick={() => onExperimentSelect?.({ id: exp.id, title: exp.title, description: '', benchmark: '', created_at: '', updated_at: '' })}
                          >
                            {exp.title}
                            {exp.benchmark && (
                              <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Control</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ExperimentList
