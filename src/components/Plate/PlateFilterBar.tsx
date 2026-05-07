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
    <>
    <div className="flex gap-2 mt-4 relative" ref={menuRef}>
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
            <div className="relative"
              onMouseEnter={() => {
                clearAllTimeouts()
                setVariablesMenu(true); setStrainMenu(false); setMediaMenu(false); setKeywordMenu(false)
                setOpenStrainSection(null); setOpenMediaSection(null); setOpenMediaComponent(null)
              }}
              onMouseLeave={() => setWithDelay(() => { setVariablesMenu(false); setVariableValuesMenu(null) })}
            >
              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Variables</div>
              {variablesMenu && (
                <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                  {Object.entries(uniqueNames.variables)
                    .sort(([a], [b]) => {
                      const an = parseFloat(a), bn = parseFloat(b)
                      if (!isNaN(an) && !isNaN(bn)) return an - bn
                      return a.toLowerCase().localeCompare(b.toLowerCase())
                    })
                    .map(([variableName, variableValues]) => (
                      <div className="relative" key={variableName}
                        onMouseEnter={() => { clearAllTimeouts(); setVariableValuesMenu(variableName) }}
                        onMouseLeave={() => setWithDelay(() => setVariableValuesMenu(null))}
                      >
                        <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{variableName}</div>
                        {variableValuesMenu === variableName && (
                          <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                            onMouseEnter={() => clearAllTimeouts()}
                            onMouseLeave={() => setWithDelay(() => setVariableValuesMenu(null))}
                          >
                            {sortItems(variableValues).map((val, vi) => (
                              <div key={vi}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                                onClick={() => applyVariableFilter(variableName, val)}>
                                {val}
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
            <div className="relative"
              onMouseEnter={() => {
                clearAllTimeouts()
                setStrainMenu(true); setVariablesMenu(false); setMediaMenu(false); setKeywordMenu(false)
                setOpenMediaSection(null); setOpenMediaComponent(null); setVariableValuesMenu(null)
              }}
              onMouseLeave={() => setWithDelay(() => { setStrainMenu(false); setOpenStrainSection(null) })}
            >
              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Strain</div>
              {strainMenu && (
                <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                  onMouseEnter={() => clearAllTimeouts()}
                >
                  {(['most_recent', 'most_common', 'all'] as const).map(section => {
                    const items = strainTree[section]
                    const label = section === 'most_recent' ? 'Most recent'
                                : section === 'most_common' ? 'Most common' : 'All'
                    const empty = section === 'most_recent' ? 'No recent strains'
                                : section === 'most_common' ? 'No common strains' : 'No strains'
                    return (
                      <div className="relative" key={section}
                        onMouseEnter={() => { clearAllTimeouts(); setOpenStrainSection(section) }}
                        onMouseLeave={() => setWithDelay(() => setOpenStrainSection(null))}
                      >
                        <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">{label}</div>
                        {openStrainSection === section && (
                          <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                            {items.length === 0 ? (
                              <div className="px-4 py-2 text-sm text-gray-400">{empty}</div>
                            ) : items.map(s => (
                              <div key={s}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer whitespace-nowrap"
                                onClick={() => applyStrainFilter(s)}>
                                {s}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Media — FLAT (no batch/feed split) */}
            <div className="relative"
              onMouseEnter={() => {
                clearAllTimeouts()
                setMediaMenu(true); setVariablesMenu(false); setStrainMenu(false); setKeywordMenu(false)
                setOpenStrainSection(null); setVariableValuesMenu(null)
              }}
              onMouseLeave={() => setWithDelay(() => { setMediaMenu(false); setOpenMediaSection(null); setOpenMediaComponent(null) })}
            >
              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm whitespace-nowrap">Media</div>
              {mediaMenu && (() => {
                const renderList = (items: MediaTreeEntry[], emptyText: string) => (
                  <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                    {items.length === 0 ? (
                      <div className="px-4 py-2 text-sm text-gray-400">{emptyText}</div>
                    ) : items.map(m => (
                      <div key={m.id}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                        onClick={() => applyMediaFilter(m)}>
                        {m.name}
                      </div>
                    ))}
                  </div>
                )
                const renderGrouped = (groups: MediaTreeGroup[], section: MediaSection) => (
                  <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1">
                    {groups.length === 0 ? (
                      <div className="px-4 py-2 text-sm text-gray-400">None</div>
                    ) : groups.map(g => (
                      <div key={g.name} className="relative"
                        onMouseEnter={() => { clearAllTimeouts(); setOpenMediaComponent(section + ':' + g.name) }}
                        onMouseLeave={() => setWithDelay(() => setOpenMediaComponent(null))}
                      >
                        <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{g.name}</div>
                        {openMediaComponent === section + ':' + g.name && renderList(g.media, 'No media')}
                      </div>
                    ))}
                  </div>
                )
                const enterSection = (target: MediaSection) => {
                  clearAllTimeouts()
                  if (openMediaSection !== target) {
                    setOpenMediaSection(target); setOpenMediaComponent(null)
                  }
                }
                const closeSectionSoon = () => setWithDelay(() => {
                  setOpenMediaSection(null); setOpenMediaComponent(null)
                })
                const sections: { key: MediaSection; label: string; render: () => React.ReactNode }[] = [
                  { key: 'most_recent', label: 'Most recent', render: () => renderList(mediaTree.most_recent, 'No recent media') },
                  { key: 'most_common', label: 'Most common', render: () => renderList(mediaTree.most_common, 'No common media') },
                  { key: 'by_carbon_source', label: 'Carbon Source', render: () => renderGrouped(mediaTree.by_carbon_source, 'by_carbon_source') },
                  { key: 'by_nitrogen_source', label: 'Nitrogen Source', render: () => renderGrouped(mediaTree.by_nitrogen_source, 'by_nitrogen_source') },
                  { key: 'by_complex_component', label: 'Complex Component', render: () => renderGrouped(mediaTree.by_complex_component, 'by_complex_component') },
                  { key: 'all', label: 'All', render: () => renderList(mediaTree.all, 'No media') },
                ]
                return (
                  <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                    onMouseEnter={() => clearAllTimeouts()}
                  >
                    {sections.map(({ key, label, render }) => (
                      <div className="relative" key={key}
                        onMouseEnter={() => enterSection(key)}
                        onMouseLeave={closeSectionSoon}
                      >
                        <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{label}</div>
                        {openMediaSection === key && render()}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Keyword */}
            <div className="relative"
              onMouseEnter={() => {
                clearAllTimeouts()
                setKeywordMenu(true); setVariablesMenu(false); setStrainMenu(false); setMediaMenu(false)
                setOpenStrainSection(null); setOpenMediaSection(null); setOpenMediaComponent(null); setVariableValuesMenu(null)
              }}
              onMouseLeave={() => setWithDelay(() => setKeywordMenu(false))}
            >
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
                          const kw = e.currentTarget.value.trim()
                          if (kw) applyKeywordFilter(kw)
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
          <div className="absolute top-full left-0 w-auto min-w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] mt-1"
            onMouseEnter={() => clearAllTimeouts()}
          >

            {/* Products */}
            <div className="relative"
              onMouseEnter={() => {
                clearAllTimeouts()
                setProductsMenu(true); setSecondaryProductsMenu(false); setActiveSortItem(null)
              }}
              onMouseLeave={() => setWithDelay(() => setProductsMenu(false))}
            >
              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Products</div>
              {productsMenu && (
                <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                  onMouseEnter={() => clearAllTimeouts()}
                >
                  {uniqueNames.measurements.products.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">No products</div>
                  ) : sortItems([...uniqueNames.measurements.products]).map((p) => (
                    <div className="relative" key={`p:${p}`}
                      onMouseEnter={() => { clearAllTimeouts(); setActiveSortItem('p:' + p) }}
                      onMouseLeave={() => setWithDelay(() => setActiveSortItem(null))}
                    >
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{p}</div>
                      {activeSortItem === 'p:' + p && (
                        <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg ml-1" style={{ zIndex: 9999 }}
                          onMouseEnter={() => clearAllTimeouts()}
                          onMouseLeave={() => setWithDelay(() => setActiveSortItem(null))}
                        >
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                            onClick={() => applySort(`product_${p}`, 'desc')}>Highest first</div>
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                            onClick={() => applySort(`product_${p}`, 'asc')}>Lowest first</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Secondary Products */}
            <div className="relative"
              onMouseEnter={() => {
                clearAllTimeouts()
                setSecondaryProductsMenu(true); setProductsMenu(false); setActiveSortItem(null)
              }}
              onMouseLeave={() => setWithDelay(() => setSecondaryProductsMenu(false))}
            >
              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Secondary Products</div>
              {secondaryProductsMenu && (
                <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                  onMouseEnter={() => clearAllTimeouts()}
                >
                  {uniqueNames.measurements.secondary_products.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">No secondary products</div>
                  ) : sortItems([...uniqueNames.measurements.secondary_products]).map((sp) => (
                    <div className="relative" key={`sp:${sp}`}
                      onMouseEnter={() => { clearAllTimeouts(); setActiveSortItem('sp:' + sp) }}
                      onMouseLeave={() => setWithDelay(() => setActiveSortItem(null))}
                    >
                      <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">{sp}</div>
                      {activeSortItem === 'sp:' + sp && (
                        <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                          onMouseEnter={() => clearAllTimeouts()}
                          onMouseLeave={() => setWithDelay(() => setActiveSortItem(null))}
                        >
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                            onClick={() => applySort(`secondary_product_${sp}`, 'desc')}>Highest first</div>
                          <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
                            onClick={() => applySort(`secondary_product_${sp}`, 'asc')}>Lowest first</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Date */}
            <div className="relative"
              onMouseEnter={() => {
                clearAllTimeouts()
                setProductsMenu(false); setSecondaryProductsMenu(false)
                setActiveSortItem('dated')
              }}
              onMouseLeave={() => setWithDelay(() => setActiveSortItem(null))}
            >
              <div className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">Date</div>
              {activeSortItem === 'dated' && (
                <div className="absolute left-full top-0 w-auto min-w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] ml-1"
                  onMouseEnter={() => clearAllTimeouts()}
                  onMouseLeave={() => setWithDelay(() => setActiveSortItem(null))}
                >
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

    {/* Active filter chips */}
    {(value.variables?.length || value.strain || value.media || value.keyword) && (
      <div className="flex flex-wrap gap-2 mt-4">
        {value.variables?.map((v, i) => (
          <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full flex items-center gap-1">
            {v.name}{v.value && ` = ${v.value}`}
            <button
              className="ml-1 hover:text-blue-600"
              onClick={() => {
                const newVars = (value.variables ?? []).filter((_, idx) => idx !== i)
                onChange({ ...value, variables: newVars.length > 0 ? newVars : undefined })
              }}
            >x</button>
          </span>
        ))}
        {value.strain && (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full flex items-center gap-1">
            Strain: {value.strain}
            <button className="ml-1 hover:text-blue-600"
              onClick={() => onChange({ ...value, strain: undefined })}>x</button>
          </span>
        )}
        {value.media && (
          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full flex items-center gap-1">
            Media: {value.media.name}
            <button className="ml-1 hover:text-orange-600"
              onClick={() => onChange({ ...value, media: undefined })}>x</button>
          </span>
        )}
        {value.keyword && (
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full flex items-center gap-1">
            Keyword: {value.keyword}
            <button className="ml-1 hover:text-yellow-600"
              onClick={() => onChange({ ...value, keyword: undefined })}>x</button>
          </span>
        )}
      </div>
    )}

    {/* Current sort */}
    {value.sortBy && value.sortOrder && (
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
          Sorted by: {
            value.sortBy === 'date'
              ? 'Date'
              : value.sortBy.replace(/^secondary_product_/, '').replace(/^product_/, '')
          }
          {' '}({value.sortOrder === 'desc'
            ? (value.sortBy === 'date' ? 'Newest first' : 'Highest first')
            : (value.sortBy === 'date' ? 'Oldest first'  : 'Lowest first')
          })
        </span>
      </div>
    )}
    </>
  )
}

export default PlateFilterBar
