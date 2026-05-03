'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'

export interface PlateFilters {
  variables?: { name: string; value: string }[]
  strain?: string
  media?: { id: number; name: string }
  keyword?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface PlateFilterBarProps {
  projectId: number | null
  value: PlateFilters
  onChange: (v: PlateFilters) => void
}

interface MediaTreeEntry { id: number; name: string }
interface MediaTreeGroup { name: string; media: MediaTreeEntry[] }
interface FlatMediaTree {
  most_recent: MediaTreeEntry[]
  most_common: MediaTreeEntry[]
  by_carbon_source: MediaTreeGroup[]
  by_nitrogen_source: MediaTreeGroup[]
  by_complex_component: MediaTreeGroup[]
  all: MediaTreeEntry[]
}
const emptyMediaTree: FlatMediaTree = {
  most_recent: [], most_common: [],
  by_carbon_source: [], by_nitrogen_source: [],
  by_complex_component: [], all: [],
}

interface StrainTree { most_recent: string[]; most_common: string[]; all: string[] }
const emptyStrainTree: StrainTree = { most_recent: [], most_common: [], all: [] }

interface UniqueNames {
  variables: { [name: string]: string[] }
  measurements: { products: string[]; secondary_products: string[] }
}
const emptyUniqueNames: UniqueNames = {
  variables: {}, measurements: { products: [], secondary_products: [] },
}

const sortItems = (items: string[]): string[] =>
  [...items].sort((a, b) => {
    const aNum = parseFloat(a)
    const bNum = parseFloat(b)
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum
    return a.toLowerCase().localeCompare(b.toLowerCase())
  })

export function PlateFilterBar({ projectId, value, onChange }: PlateFilterBarProps) {
  const { getToken } = useAuth()

  const [uniqueNames, setUniqueNames] = useState<UniqueNames>(emptyUniqueNames)
  const [mediaTree, setMediaTree] = useState<FlatMediaTree>(emptyMediaTree)
  const [strainTree, setStrainTree] = useState<StrainTree>(emptyStrainTree)

  // Top-level menus
  const [filterMenu, setFilterMenu] = useState(false)
  const [sortMenu, setSortMenu] = useState(false)

  // Filter sub-menus
  const [variablesMenu, setVariablesMenu] = useState(false)
  const [variableValuesMenu, setVariableValuesMenu] = useState<string | null>(null)
  const [strainMenu, setStrainMenu] = useState(false)
  const [openStrainSection, setOpenStrainSection] = useState<'most_recent' | 'most_common' | 'all' | null>(null)
  const [mediaMenu, setMediaMenu] = useState(false)
  type MediaSection = 'most_recent' | 'most_common' | 'by_carbon_source' | 'by_nitrogen_source' | 'by_complex_component' | 'all'
  const [openMediaSection, setOpenMediaSection] = useState<MediaSection | null>(null)
  const [openMediaComponent, setOpenMediaComponent] = useState<string | null>(null)
  const [keywordMenu, setKeywordMenu] = useState(false)

  // Sort sub-menus
  const [productsMenu, setProductsMenu] = useState(false)
  const [secondaryProductsMenu, setSecondaryProductsMenu] = useState(false)
  const [activeSortItem, setActiveSortItem] = useState<string | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)
  const timeouts = useRef<NodeJS.Timeout[]>([])

  const clearAllTimeouts = () => {
    timeouts.current.forEach(t => clearTimeout(t))
    timeouts.current = []
  }

  const closeAllMenus = () => {
    clearAllTimeouts()
    setFilterMenu(false); setSortMenu(false)
    setVariablesMenu(false); setVariableValuesMenu(null)
    setStrainMenu(false); setOpenStrainSection(null)
    setMediaMenu(false); setOpenMediaSection(null); setOpenMediaComponent(null)
    setKeywordMenu(false)
    setProductsMenu(false); setSecondaryProductsMenu(false); setActiveSortItem(null)
  }

  const setWithDelay = (setter: () => void, delay = 1000) => {
    const t = setTimeout(() => { setter() }, delay)
    timeouts.current.push(t)
  }

  // Outside-click handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeAllMenus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => { document.removeEventListener('mousedown', handleClickOutside) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => clearAllTimeouts(), [])

  // Fetch dropdown data when project changes
  useEffect(() => {
    let cancelled = false
    const fetchAll = async () => {
      try {
        const token = await getToken()
        const qs = new URLSearchParams()
        if (projectId) qs.set('project_id', String(projectId))
        const headers = { Authorization: `Bearer ${token}` }
        const base = process.env.NEXT_PUBLIC_API_URL

        const [un, mt, st] = await Promise.all([
          fetch(`${base}/api/plate-experiments/unique-names/?${qs}`, { headers }),
          fetch(`${base}/api/plate-experiments/media-filter-tree/?${qs}`, { headers }),
          fetch(`${base}/api/plate-experiments/strain-filter-tree/?${qs}`, { headers }),
        ])
        if (cancelled) return
        if (un.ok) setUniqueNames(await un.json())
        if (mt.ok) setMediaTree(await mt.json())
        if (st.ok) setStrainTree(await st.json())
      } catch {
        // Non-critical; the menus will just show as empty.
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [projectId, getToken])

  const applyVariableFilter = (name: string, val: string) => {
    closeAllMenus()
    const existing = value.variables ?? []
    if (existing.some(v => v.name === name && v.value === val)) return
    onChange({ ...value, variables: [...existing, { name, value: val }] })
  }
  const applyStrainFilter = (name: string) => {
    closeAllMenus()
    onChange({ ...value, strain: name })
  }
  const applyMediaFilter = (entry: MediaTreeEntry) => {
    closeAllMenus()
    onChange({ ...value, media: { id: entry.id, name: entry.name } })
  }
  const applyKeywordFilter = (kw: string) => {
    closeAllMenus()
    onChange({ ...value, keyword: kw })
  }
  const applySort = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    closeAllMenus()
    onChange({ ...value, sortBy, sortOrder })
  }
  const clearAll = () => {
    closeAllMenus()
    onChange({})
  }

  // Render placeholder until we add the menu JSX in the next task
  return (
    <div className="flex gap-2 mt-4 relative" ref={menuRef}>
      <div className="flex-1 relative">
        <button
          className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
          onClick={() => { setFilterMenu(!filterMenu); setSortMenu(false) }}
        >
          Filter
        </button>
      </div>
      <div className="flex-1 relative">
        <button
          className="w-full h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
          onClick={() => { setSortMenu(!sortMenu); setFilterMenu(false) }}
        >
          Sort
        </button>
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
  )
}

export default PlateFilterBar
