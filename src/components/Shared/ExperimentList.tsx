'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { DashboardTabs, DashboardSection } from '@/components/Plate/DashboardTabs'
import { usePlateExperiments } from '@/hooks/usePlateExperiment'

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
  refreshKey?: number
}

export const ExperimentList = ({ onExperimentSelect, onExperimentsChange, onExperimentSetSelect, isMobileDrawer = false, refreshKey }: ExperimentListProps) => {
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

  const [section, setSection] = useState<DashboardSection>('reactor')
  const [viewMode, setViewMode] = useState<'experiments' | 'sets'>('experiments')
  const { data: plateData, loading: platesLoading, error: platesError } =
    usePlateExperiments({ projectId: activeProject?.id ?? null })
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
    batch_media?: { id: number; name: string }
    feed_media?: { id: number; name: string }
  }>({})

  // Filter dropdown variables
  const [filterMenu, setFilterMenu] = useState(false)
  const [variablesMenu, setVariablesMenu] = useState(false)
  const [keywordMenu, setKeywordMenu] = useState(false)
  const [strainMenu, setStrainMenu] = useState(false)
  const [mediaMenu, setMediaMenu] = useState(false)
  const [variableValuesMenu, setVariableValuesMenu] = useState<string | null>(null)

  // Media filter dropdown state — three levels deep (slot → section → component → media)
  type MediaSlot = 'batch' | 'feed'
  type MediaSection = 'most_recent' | 'most_common' | 'by_carbon_source' | 'by_nitrogen_source' | 'by_complex_component' | 'all'
  interface MediaTreeEntry { id: number; name: string }
  interface MediaTreeGroup { name: string; media: MediaTreeEntry[] }
  interface MediaTreeSlot {
    most_recent: MediaTreeEntry[]
    most_common: MediaTreeEntry[]
    by_carbon_source: MediaTreeGroup[]
    by_nitrogen_source: MediaTreeGroup[]
    by_complex_component: MediaTreeGroup[]
    all: MediaTreeEntry[]
  }
  const emptySlot: MediaTreeSlot = {
    most_recent: [], most_common: [],
    by_carbon_source: [], by_nitrogen_source: [],
    by_complex_component: [], all: [],
  }
  const [mediaTree, setMediaTree] = useState<{ batch: MediaTreeSlot; feed: MediaTreeSlot }>({
    batch: emptySlot, feed: emptySlot,
  })
  const [openMediaSlot, setOpenMediaSlot] = useState<MediaSlot | null>(null)
  const [openMediaSection, setOpenMediaSection] = useState<MediaSection | null>(null)
  const [openMediaComponent, setOpenMediaComponent] = useState<string | null>(null)

  // Strain filter tree — mirrors the media menu's most_recent / most_common / all shape
  type StrainSection = 'most_recent' | 'most_common' | 'all'
  const [strainTree, setStrainTree] = useState<{ most_recent: string[]; most_common: string[]; all: string[] }>({
    most_recent: [], most_common: [], all: [],
  })
  const [openStrainSection, setOpenStrainSection] = useState<StrainSection | null>(null)
  const strainSectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
  const keywordTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const strainTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const productsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const secondaryProductsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const variableValuesTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mediaMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mediaSlotTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mediaSectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mediaComponentTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearAllTimeouts = () => {
    if (variablesTimeoutRef.current) clearTimeout(variablesTimeoutRef.current)
    if (keywordTimeoutRef.current) clearTimeout(keywordTimeoutRef.current)
    if (strainTimeoutRef.current) clearTimeout(strainTimeoutRef.current)
    if (productsTimeoutRef.current) clearTimeout(productsTimeoutRef.current)
    if (secondaryProductsTimeoutRef.current) clearTimeout(secondaryProductsTimeoutRef.current)
    if (variableValuesTimeoutRef.current) clearTimeout(variableValuesTimeoutRef.current)
    if (mediaMenuTimeoutRef.current) clearTimeout(mediaMenuTimeoutRef.current)
    if (mediaSlotTimeoutRef.current) clearTimeout(mediaSlotTimeoutRef.current)
    if (mediaSectionTimeoutRef.current) clearTimeout(mediaSectionTimeoutRef.current)
    if (mediaComponentTimeoutRef.current) clearTimeout(mediaComponentTimeoutRef.current)
    if (strainSectionTimeoutRef.current) clearTimeout(strainSectionTimeoutRef.current)
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

    const fetchMediaTree = async () => {
      try {
        const token = await getToken()
        const params = new URLSearchParams()
        if (activeProject) params.append('project_id', activeProject.id.toString())
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/media/filter-tree/?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data = await res.json()
          setMediaTree({ batch: data.batch ?? emptySlot, feed: data.feed ?? emptySlot })
        }
      } catch {
        // Non-critical — media menu just stays empty
      }
    }
    fetchMediaTree()

    const fetchStrainTree = async () => {
      try {
        const token = await getToken()
        const params = new URLSearchParams()
        if (activeProject) params.append('project_id', activeProject.id.toString())
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/strains/filter-tree/?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data = await res.json()
          setStrainTree({
            most_recent: data.most_recent ?? [],
            most_common: data.most_common ?? [],
            all: data.all ?? [],
          })
        }
      } catch {
        // Non-critical — strain menu just stays empty
      }
    }
    fetchStrainTree()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, refreshKey])

  // Refetch whenever the page, sort, filters, or project change.
  useEffect(() => {
    fetchExperiments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentSortBy, currentSortOrder, activeFilters, activeProject])

  // Reset to page 1 when sort/filters/project change — but NOT when the user
  // changes the page itself, otherwise pagination clicks get stomped back to 1.
  useEffect(() => {
    setCurrentPage(1)
     
  }, [currentSortBy, currentSortOrder, activeFilters, activeProject])

  // Auto-select the first experiment only on initial load and when the user
  // changes filters/sort/project — NOT on pagination. Paging through the list
  // updates the dropdown contents but should leave the currently displayed
  // experiment (e.g. in QuickGraph) untouched.
  const shouldAutoSelectRef = useRef(true)
  useEffect(() => {
    shouldAutoSelectRef.current = true
  }, [currentSortBy, currentSortOrder, activeFilters, activeProject])

  useEffect(() => {
    if (!shouldAutoSelectRef.current) return
    if (experiments.length > 0 && onExperimentSelect) {
      onExperimentSelect(experiments[0])
      shouldAutoSelectRef.current = false
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
        setKeywordMenu(false)
        setStrainMenu(false)
        setMediaMenu(false)
        setVariableValuesMenu(null)
        setProductsMenu(false)
        setSecondaryProductsMenu(false)
        setOpenMediaSlot(null)
        setOpenMediaSection(null)
        setOpenMediaComponent(null)
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
    setKeywordMenu(false)
    setStrainMenu(false)
    setMediaMenu(false)
    setVariableValuesMenu(null)
    setProductsMenu(false)
    setSecondaryProductsMenu(false)
    setOpenMediaSlot(null)
    setOpenMediaSection(null)
    setOpenMediaComponent(null)
    setActiveSortItem(null)
    setCurrentSortBy(null)
    setCurrentSortOrder(null)
    fetchExperimentsWithPage(1, {})
  }

  const applyMediaFilter = (slot: MediaSlot, entry: MediaTreeEntry) => {
    clearAllTimeouts()
    const newFilters = { ...activeFilters }
    if (slot === 'batch') newFilters.batch_media = { id: entry.id, name: entry.name }
    else newFilters.feed_media = { id: entry.id, name: entry.name }
    setActiveFilters(newFilters)
    setCurrentPage(1)
    setFilterMenu(false)
    setMediaMenu(false)
    setOpenMediaSlot(null)
    setOpenMediaSection(null)
    setOpenMediaComponent(null)
    fetchExperimentsWithPage(1, newFilters, currentSortBy || undefined, currentSortOrder || undefined)
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
      if (filters.batch_media) params.append('batch_media_id', filters.batch_media.id.toString())
      if (filters.feed_media) params.append('feed_media_id', filters.feed_media.id.toString())
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
      if (activeFilters.batch_media) params.append('batch_media_id', activeFilters.batch_media.id.toString())
      if (activeFilters.feed_media) params.append('feed_media_id', activeFilters.feed_media.id.toString())
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

  const renderMediaSlotMenu = (slot: MediaSlot) => {
    const tree = mediaTree[slot]
    const closeSectionSoon = () => setMenuWithDelay(
      (v: boolean) => { if (!v) { setOpenMediaSection(null); setOpenMediaComponent(null) } },
      mediaSectionTimeoutRef,
    )

    const renderMediaList = (items: MediaTreeEntry[], emptyText: string) => (
      <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
        {items.length === 0 ? (
          <div className="px-4 py-2 text-sm text-gray-400">{emptyText}</div>
        ) : items.map((m) => (
          <div key={m.id}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
            onClick={() => applyMediaFilter(slot, m)}>
            {m.name}
          </div>
        ))}
      </div>
    )

    const renderGrouped = (groups: MediaTreeGroup[], section: MediaSection) => (
      // Note: no max-height / overflow here. Setting overflow-y implicitly
      // clips overflow-x too, which would trap the inner media sub-panel
      // inside this panel's box instead of letting it float to the right.
      <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
        {groups.length === 0 ? (
          <div className="px-4 py-2 text-sm text-gray-400">None</div>
        ) : groups.map((g) => (
          <div key={g.name} className="relative"
            onMouseEnter={() => {
              clearAllTimeouts()
              setOpenMediaComponent(section + ':' + g.name)
            }}
            onMouseLeave={() => setMenuWithDelay(
              (v: boolean) => { if (!v) setOpenMediaComponent(null) },
              mediaComponentTimeoutRef,
            )}
          >
            <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{g.name}</div>
            {openMediaComponent === section + ':' + g.name && renderMediaList(g.media, 'No media')}
          </div>
        ))}
      </div>
    )

    const enterSection = (target: MediaSection) => {
      clearAllTimeouts()
      // Only reset the child (component) state when actually switching sections.
      // Re-firing mouseenter on the same section (e.g. after crossing the gap
      // between the section label and its open sub-panel) must not wipe out
      // the currently-open component sub-panel.
      if (openMediaSection !== target) {
        setOpenMediaSection(target)
        setOpenMediaComponent(null)
      }
    }

    return (
      <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
        {/* Most recent */}
        <div className="relative"
          onMouseEnter={() => enterSection('most_recent')}
          onMouseLeave={closeSectionSoon}
        >
          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Most recent</div>
          {openMediaSection === 'most_recent' && renderMediaList(tree.most_recent, 'No recent media')}
        </div>
        {/* Most common */}
        <div className="relative"
          onMouseEnter={() => enterSection('most_common')}
          onMouseLeave={closeSectionSoon}
        >
          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Most common</div>
          {openMediaSection === 'most_common' && renderMediaList(tree.most_common, 'No common media')}
        </div>
        {/* Carbon Source */}
        <div className="relative"
          onMouseEnter={() => enterSection('by_carbon_source')}
          onMouseLeave={closeSectionSoon}
        >
          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Carbon Source</div>
          {openMediaSection === 'by_carbon_source' && renderGrouped(tree.by_carbon_source, 'by_carbon_source')}
        </div>
        {/* Nitrogen Source */}
        <div className="relative"
          onMouseEnter={() => enterSection('by_nitrogen_source')}
          onMouseLeave={closeSectionSoon}
        >
          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Nitrogen Source</div>
          {openMediaSection === 'by_nitrogen_source' && renderGrouped(tree.by_nitrogen_source, 'by_nitrogen_source')}
        </div>
        {/* Complex Component */}
        <div className="relative"
          onMouseEnter={() => enterSection('by_complex_component')}
          onMouseLeave={closeSectionSoon}
        >
          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Complex Component</div>
          {openMediaSection === 'by_complex_component' && renderGrouped(tree.by_complex_component, 'by_complex_component')}
        </div>
        {/* All */}
        <div className="relative"
          onMouseEnter={() => enterSection('all')}
          onMouseLeave={closeSectionSoon}
        >
          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">All</div>
          {openMediaSection === 'all' && renderMediaList(tree.all, 'No media')}
        </div>
      </div>
    )
  }



  return (
    <div className={`w-full pt-4 pb-2 px-4 overflow-visible bg-white rounded-lg shadow ${
      isMobileDrawer ? 'h-full border-0 shadow-none' : ''
    }`}>
      <div className="pb-4">
        <h2 className="text-left text-xl md:text-2xl font-bold">
          {section === 'plates'
            ? 'Plate Experiments'
            : viewMode === 'experiments' ? 'Experiment List' : 'Experiment Sets'}
        </h2>
        <div className="flex items-center gap-2 mt-2">
          <DashboardTabs value={section} onChange={setSection} />
          {section === 'reactor' && (
            <button
              onClick={() => setViewMode(viewMode === 'experiments' ? 'sets' : 'experiments')}
              className="h-8 px-3 border border-gray-200 rounded-md text-xs font-medium shadow-xs hover:bg-gray-100 transition-all"
            >
              {viewMode === 'experiments' ? 'View Sets' : 'View List'}
            </button>
          )}
        </div>
        {section === 'reactor' && viewMode === 'experiments' && <><div className="flex gap-2 mt-4 relative" ref={menuRef}>
          <div className="flex-1 relative">
            <button
              className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              onClick={() => { setFilterMenu(!filterMenu); setSortMenu(false) }}
            >
              Filter
            </button>

            {filterMenu && (
              <div className="absolute top-full left-0 w-max min-w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1">
                {/* Variables */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setVariablesMenu(true); setKeywordMenu(false); setStrainMenu(false); setMediaMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                  setOpenMediaSlot(null); setOpenMediaSection(null); setOpenMediaComponent(null)
        setOpenStrainSection(null)
                }} onMouseLeave={() => setMenuWithDelay(setVariablesMenu, variablesTimeoutRef)}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Variables</div>
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

                {/* Strain */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setVariablesMenu(false); setKeywordMenu(false); setMediaMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                  setOpenMediaSlot(null); setOpenMediaSection(null); setOpenMediaComponent(null)
                  // Idempotent: don't clear the child section when re-entering the
                  // same Strain item (e.g. after crossing the gap to its sub-panel)
                  if (!strainMenu) {
                    setStrainMenu(true); setOpenStrainSection(null)
                  }
                }} onMouseLeave={() => setMenuWithDelay(
                  (v: boolean) => { if (!v) { setStrainMenu(false); setOpenStrainSection(null) } },
                  strainTimeoutRef,
                )}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Strain</div>
                  {strainMenu && (() => {
                    const enterStrainSection = (target: StrainSection) => {
                      clearAllTimeouts()
                      if (openStrainSection !== target) setOpenStrainSection(target)
                    }
                    const closeStrainSectionSoon = () => setMenuWithDelay(
                      (v: boolean) => { if (!v) setOpenStrainSection(null) },
                      strainSectionTimeoutRef,
                    )
                    const renderStrainNames = (items: string[], emptyText: string) => (
                      <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                        {items.length === 0 ? (
                          <div className="px-4 py-2 text-sm text-gray-400">{emptyText}</div>
                        ) : items.map((s) => (
                          <div key={s}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer whitespace-nowrap"
                            onClick={() => applyFilter('variable', 'strain', s)}>
                            {s}
                          </div>
                        ))}
                      </div>
                    )
                    return (
                      <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                        <div className="relative"
                          onMouseEnter={() => enterStrainSection('most_recent')}
                          onMouseLeave={closeStrainSectionSoon}
                        >
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Most recent</div>
                          {openStrainSection === 'most_recent' && renderStrainNames(strainTree.most_recent, 'No recent strains')}
                        </div>
                        <div className="relative"
                          onMouseEnter={() => enterStrainSection('most_common')}
                          onMouseLeave={closeStrainSectionSoon}
                        >
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Most common</div>
                          {openStrainSection === 'most_common' && renderStrainNames(strainTree.most_common, 'No common strains')}
                        </div>
                        <div className="relative"
                          onMouseEnter={() => enterStrainSection('all')}
                          onMouseLeave={closeStrainSectionSoon}
                        >
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">All</div>
                          {openStrainSection === 'all' && renderStrainNames(strainTree.all, 'No strains')}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Media (Batch / Feed sub-items) */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setVariablesMenu(false); setKeywordMenu(false); setStrainMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                  setOpenStrainSection(null)
                  // Idempotent: re-entering Media shouldn't wipe out an open slot panel.
                  if (!mediaMenu) {
                    setMediaMenu(true); setOpenMediaSlot(null); setOpenMediaSection(null); setOpenMediaComponent(null)
                  }
                }} onMouseLeave={() => setMenuWithDelay(
                  (v: boolean) => { if (!v) { setMediaMenu(false); setOpenMediaSlot(null); setOpenMediaSection(null); setOpenMediaComponent(null) } },
                  mediaMenuTimeoutRef,
                )}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Media</div>
                  {mediaMenu && (
                    <div className="absolute left-full top-0 w-auto min-w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                      {/* Batch */}
                      <div className="relative" onMouseEnter={() => {
                        clearAllTimeouts()
                        if (openMediaSlot !== 'batch') {
                          setOpenMediaSlot('batch'); setOpenMediaSection(null); setOpenMediaComponent(null)
                        }
                      }} onMouseLeave={() => setMenuWithDelay(
                        (v: boolean) => { if (!v) { setOpenMediaSlot(null); setOpenMediaSection(null); setOpenMediaComponent(null) } },
                        mediaSlotTimeoutRef,
                      )}>
                        <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Batch</div>
                        {openMediaSlot === 'batch' && renderMediaSlotMenu('batch')}
                      </div>

                      {/* Feed */}
                      <div className="relative" onMouseEnter={() => {
                        clearAllTimeouts()
                        if (openMediaSlot !== 'feed') {
                          setOpenMediaSlot('feed'); setOpenMediaSection(null); setOpenMediaComponent(null)
                        }
                      }} onMouseLeave={() => setMenuWithDelay(
                        (v: boolean) => { if (!v) { setOpenMediaSlot(null); setOpenMediaSection(null); setOpenMediaComponent(null) } },
                        mediaSlotTimeoutRef,
                      )}>
                        <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Feed</div>
                        {openMediaSlot === 'feed' && renderMediaSlotMenu('feed')}
                      </div>
                    </div>
                  )}
                </div>

                {/* Keyword */}
                <div className="relative" onMouseEnter={() => {
                  clearAllTimeouts()
                  setKeywordMenu(true); setVariablesMenu(false); setStrainMenu(false); setMediaMenu(false)
                  setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
                  setOpenMediaSlot(null); setOpenMediaSection(null); setOpenMediaComponent(null)
        setOpenStrainSection(null)
                }} onMouseLeave={() => setMenuWithDelay(setKeywordMenu, keywordTimeoutRef)}>
                  <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Keyword</div>
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
                  setVariablesMenu(false); setKeywordMenu(false)
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
                  setVariablesMenu(false); setKeywordMenu(false)
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
                  setVariablesMenu(false); setKeywordMenu(false)
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
        {(activeFilters.variables?.length || activeFilters.anomaly_name || activeFilters.has_anomaly || activeFilters.event_name || activeFilters.keyword || activeFilters.batch_media || activeFilters.feed_media) && (
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
            {activeFilters.batch_media && (
              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full flex items-center gap-1">
                Batch Media: {activeFilters.batch_media.name}
                <button
                  className="ml-1 hover:text-orange-600"
                  onClick={() => {
                    const newFilters = { ...activeFilters, batch_media: undefined }
                    setActiveFilters(newFilters)
                    setCurrentPage(1)
                    fetchExperimentsWithPage(1, newFilters, currentSortBy || undefined, currentSortOrder || undefined)
                  }}
                >x</button>
              </span>
            )}
            {activeFilters.feed_media && (
              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full flex items-center gap-1">
                Feed Media: {activeFilters.feed_media.name}
                <button
                  className="ml-1 hover:text-orange-600"
                  onClick={() => {
                    const newFilters = { ...activeFilters, feed_media: undefined }
                    setActiveFilters(newFilters)
                    setCurrentPage(1)
                    fetchExperimentsWithPage(1, newFilters, currentSortBy || undefined, currentSortOrder || undefined)
                  }}
                >x</button>
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

      {section === 'plates' ? (
        <div className="px-0 pb-4 overflow-y-auto flex-1">
          {platesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading plate experiments...</div>
            </div>
          ) : platesError ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-red-600">{platesError}</div>
            </div>
          ) : !plateData || plateData.results.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">No plate experiments in this project</div>
            </div>
          ) : (
            <div className="space-y-2">
              {plateData.results.map((pe) => (
                <Link
                  key={pe.id}
                  href={`/dashboard/plates/${pe.id}`}
                  className="block p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <h4 className="font-medium">{pe.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {pe.plate_count} plate{pe.plate_count === 1 ? '' : 's'} · {pe.date ?? '—'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : viewMode === 'experiments' ? (
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
