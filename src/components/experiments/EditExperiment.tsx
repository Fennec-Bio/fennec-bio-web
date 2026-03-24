'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import * as XLSX from 'xlsx'
import { SpreadsheetGrid, GridData, buildSpreadsheet } from './SpreadsheetGrid'

interface Experiment {
  id: number
  title: string
  description: string
  benchmark: string
  created_at: string
  updated_at: string
}

interface Product {
  id: number
  name: string
  unit: string
  timepoint: string
  value: number
  time_unit?: string
}

interface ExperimentDetail {
  experiment: Experiment
  products: Product[]
  secondary_products: Product[]
  process_data: Product[]
  variables: { id: number; name: string; value: string }[]
  events: { id: number; name: string; timepoint: string; value: number }[]
  anomalies: { id: number; name: string; timepoint: string; description?: string }[]
}

interface EditExperimentProps {
  selectedExperiment: Experiment | null
}

type Tab = 'primary-products' | 'secondary-products' | 'process-data' | 'variables' | 'experiment-notes'

const TABS: { key: Tab; label: string }[] = [
  { key: 'primary-products', label: 'Primary Products' },
  { key: 'secondary-products', label: 'Secondary Products' },
  { key: 'process-data', label: 'Process Data' },
  { key: 'variables', label: 'Variables' },
  { key: 'experiment-notes', label: 'Experiment Notes' },
]

export function EditExperiment({ selectedExperiment }: EditExperimentProps) {
  const { getToken } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('primary-products')
  const [data, setData] = useState<ExperimentDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const [primaryEdits, setPrimaryEdits] = useState<GridData | null>(null)
  const [secondaryEdits, setSecondaryEdits] = useState<GridData | null>(null)
  const [processEdits, setProcessEdits] = useState<GridData | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedTitle = selectedExperiment?.title ?? null

  useEffect(() => {
    if (!selectedTitle) {
      setData(null)
      setPrimaryEdits(null)
      setSecondaryEdits(null)
      setProcessEdits(null)
      setHasChanges(false)
      return
    }
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      try {
        const token = await getToken()
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(selectedTitle)}/`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok && !cancelled) {
          const detail: ExperimentDetail = await res.json()
          setData(detail)
          setPrimaryEdits(buildSpreadsheet(detail.products))
          setSecondaryEdits(buildSpreadsheet(detail.secondary_products))
          setProcessEdits(buildSpreadsheet(detail.process_data))
          setHasChanges(false)
        }
      } catch (err) {
        console.error('Error fetching experiment:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selectedTitle, getToken])

  const handleGridChange = useCallback((tab: Tab) => (grid: GridData) => {
    if (tab === 'primary-products') setPrimaryEdits(grid)
    else if (tab === 'secondary-products') setSecondaryEdits(grid)
    else if (tab === 'process-data') setProcessEdits(grid)
    setHasChanges(true)
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const arrayBuffer = evt.target?.result
      if (!arrayBuffer) return
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

      if (jsonData.length < 2) return

      const headers = jsonData[0].map(h => String(h ?? '').trim())
      const timeCol = headers.findIndex(h =>
        /^(time|timepoint|total process time)/i.test(h)
      )
      const names = headers.filter((_, i) => i !== timeCol && _ !== '')

      const rows = jsonData.slice(1)
        .filter(row => row && row.length > 0 && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''))
        .map(row => {
          const timepoint = timeCol >= 0 ? String(row[timeCol] ?? '').trim() : ''
          const values = headers.map((h, i) => {
            if (i === timeCol || h === '') return null
            const val = row[i]
            if (val === undefined || val === null || String(val).trim() === '') return ''
            const num = Number(val)
            return isNaN(num) ? String(val).trim() : num.toFixed(2)
          }).filter(v => v !== null) as string[]
          return { timepoint, values }
        })

      setProcessEdits({ names, rows })
      setHasChanges(true)
    }
    reader.readAsArrayBuffer(file)

    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }, [])

  const handleUpdate = async () => {
    console.log('Primary edits:', primaryEdits)
    console.log('Secondary edits:', secondaryEdits)
    setHasChanges(false)
  }

  const getActiveGrid = (): GridData | null => {
    if (activeTab === 'primary-products') return primaryEdits
    if (activeTab === 'secondary-products') return secondaryEdits
    if (activeTab === 'process-data') return processEdits
    return null
  }

  const isGridTab = activeTab === 'primary-products' || activeTab === 'secondary-products' || activeTab === 'process-data'

  const renderTabContent = () => {
    if (!selectedExperiment) {
      return (
        <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <p className="text-gray-400 text-sm">Select an experiment to edit</p>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
        </div>
      )
    }

    const activeGrid = getActiveGrid()

    if (activeTab === 'process-data') {
      return (
        <>
          {(!processEdits || processEdits.names.length === 0) && (
            <div
              className="flex flex-col items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-gray-400 text-sm font-medium">Click to upload an Excel spreadsheet</p>
              <p className="text-gray-300 text-xs mt-1">.xlsx or .xls</p>
            </div>
          )}
          {processEdits && processEdits.names.length > 0 && (
            <SpreadsheetGrid
              grid={processEdits}
              onChange={handleGridChange('process-data')}
              showAddRow
              showAddColumn
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
        </>
      )
    }

    if (activeTab === 'primary-products' || activeTab === 'secondary-products') {
      if (!activeGrid || activeGrid.names.length === 0) {
        const emptyMessage = activeTab === 'primary-products' ? 'No primary product data' : 'No secondary product data'
        return (
          <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-gray-400 text-sm">{emptyMessage}</p>
          </div>
        )
      }
      return (
        <SpreadsheetGrid
          grid={activeGrid}
          onChange={handleGridChange(activeTab)}
          showAddRow
          showAddColumn
        />
      )
    }

    // Variables, experiment notes — coming soon
    return (
      <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <p className="text-gray-400 text-sm">Coming soon</p>
      </div>
    )
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === key
                ? 'border-b-2 border-[#eb5234] text-[#eb5234]'
                : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {renderTabContent()}

        {/* Update button + Upload File button */}
        {selectedExperiment && isGridTab && (
          <div className="flex justify-end gap-2 mt-4">
            {activeTab === 'process-data' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
              >
                Upload File
              </button>
            )}
            <button
              onClick={handleUpdate}
              disabled={!hasChanges}
              className="px-6 py-2 text-sm font-medium text-white rounded-md shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: '#eb5234' }}
            >
              Update
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default EditExperiment
