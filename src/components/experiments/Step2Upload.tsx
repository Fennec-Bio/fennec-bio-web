'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/nextjs'
import { SpreadsheetGrid, GridData, buildSpreadsheet } from './SpreadsheetGrid'

export interface ClassifiedData {
  products: { name: string; column_header: string; unit: string; data_type: string; time_unit: string; data: { timepoint: string; value: number }[] }[]
  secondary_products: { name: string; column_header: string; unit: string; type: string; data_type: string; time_unit: string; data: { timepoint: string; value: number }[] }[]
  process_data: { name: string; column_header: string; unit: string; type: string; data_type: string; time_unit: string; data: { time: string; value: number }[] }[]
  ignored: string[]
}

interface Step2UploadProps {
  onClassified: (data: ClassifiedData) => void
  onBack: () => void
  onSkip: () => void
  projectId: number
}

type UploadState = 'idle' | 'uploading' | 'scanning' | 'classified' | 'error'
type PreviewTab = 'primary-products' | 'secondary-products' | 'process-data'

const PREVIEW_TABS: { key: PreviewTab; label: string }[] = [
  { key: 'primary-products', label: 'Primary Products' },
  { key: 'secondary-products', label: 'Secondary Products' },
  { key: 'process-data', label: 'Process Data' },
]

function classifiedToGrid(
  items: { name: string; data: { timepoint?: string; time?: string; value: number }[] }[]
): GridData {
  const names = items.map(i => i.name)
  const timepointSet = new Map<string, number>()
  items.forEach(item => {
    item.data.forEach(d => {
      const tp = (d.timepoint ?? d.time ?? '0').toString()
      if (!timepointSet.has(tp)) {
        const n = parseFloat(tp)
        timepointSet.set(tp, isNaN(n) ? 0 : n)
      }
    })
  })
  const timepoints = [...timepointSet.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0])

  const lookup = new Map<string, number>()
  items.forEach(item => {
    item.data.forEach(d => {
      const tp = (d.timepoint ?? d.time ?? '0').toString()
      lookup.set(`${tp}|${item.name}`, d.value)
    })
  })

  const rows = timepoints.map(tp => ({
    timepoint: tp,
    values: names.map(name => {
      const val = lookup.get(`${tp}|${name}`)
      return val !== undefined ? val.toFixed(2) : ''
    }),
  }))

  return { names, rows }
}

const MAX_POLLS = 48 // 2 minutes at 2500ms intervals

export function Step2Upload({ onClassified, onBack, onSkip, projectId }: Step2UploadProps) {
  const { getToken } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [isDragActive, setIsDragActive] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileName, setFileName] = useState('')
  const [scanId, setScanId] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const [classifiedData, setClassifiedData] = useState<ClassifiedData | null>(null)

  // Track deselected items per category
  const [deselectedProducts, setDeselectedProducts] = useState<Set<string>>(new Set())
  const [deselectedSecondary, setDeselectedSecondary] = useState<Set<string>>(new Set())
  const [deselectedProcess, setDeselectedProcess] = useState<Set<string>>(new Set())

  const [previewTab, setPreviewTab] = useState<PreviewTab>('primary-products')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  // Baseline grids from last experiment
  const [baselinePrimary, setBaselinePrimary] = useState<GridData | null>(null)
  const [baselineSecondary, setBaselineSecondary] = useState<GridData | null>(null)
  const [baselineProcess, setBaselineProcess] = useState<GridData | null>(null)

  // Fetch last experiment's data as baseline
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const fetchBaseline = async () => {
      try {
        const token = await getToken()
        // Get the most recent experiment for this project
        const listRes = await fetch(
          `${apiUrl}/api/experimentList/?project_id=${projectId}&sort_by=date&sort_order=desc&page=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!listRes.ok || cancelled) return
        const listData = await listRes.json()
        const experiments = listData?.experiments?.experiments ?? []
        if (experiments.length === 0) return

        const title = experiments[0].title
        const detailRes = await fetch(
          `${apiUrl}/api/experiment/title/${encodeURIComponent(title)}/`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!detailRes.ok || cancelled) return
        const detail = await detailRes.json()

        if (!cancelled) {
          const emptyGrid = (items: { name: string }[]): GridData => {
            const names = [...new Set(items.map(i => i.name))].sort()
            if (names.length === 0) return { names: [], rows: [] }
            return { names, rows: [{ timepoint: '', values: names.map(() => '') }] }
          }
          setBaselinePrimary(emptyGrid(detail.products ?? []))
          setBaselineSecondary(emptyGrid(detail.secondary_products ?? []))
          setBaselineProcess(emptyGrid(detail.process_data ?? []))
        }
      } catch {
        // Silently fail — baseline is optional
      }
    }
    fetchBaseline()
    return () => { cancelled = true }
  }, [projectId, getToken, apiUrl])

  // Classified grids override baseline when available
  const classifiedPrimary = useMemo(() => classifiedData ? classifiedToGrid(classifiedData.products) : null, [classifiedData])
  const classifiedSecondary = useMemo(() => classifiedData ? classifiedToGrid(classifiedData.secondary_products) : null, [classifiedData])
  const classifiedProcess = useMemo(() => classifiedData ? classifiedToGrid(classifiedData.process_data.map(p => ({ ...p, data: p.data.map(d => ({ ...d, timepoint: d.time })) }))) : null, [classifiedData])

  // Use classified data if available, otherwise baseline
  const primaryGrid = classifiedPrimary ?? baselinePrimary
  const secondaryGrid = classifiedSecondary ?? baselineSecondary
  const processGrid = classifiedProcess ?? baselineProcess

  // Auto-select first tab that has data
  useEffect(() => {
    const grids: [PreviewTab, GridData | null][] = [
      ['primary-products', primaryGrid],
      ['secondary-products', secondaryGrid],
      ['process-data', processGrid],
    ]
    const first = grids.find(([, g]) => g && g.names.length > 0)
    if (first) setPreviewTab(first[0])
  }, [primaryGrid, secondaryGrid, processGrid])

  const resetToIdle = () => {
    setUploadState('idle')
    setErrorMessage('')
    setFileName('')
    setScanId(null)
    setPollCount(0)
    setClassifiedData(null)
    setDeselectedProducts(new Set())
    setDeselectedSecondary(new Set())
    setDeselectedProcess(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleError = (msg: string) => {
    setErrorMessage(msg)
    setUploadState('error')
  }

  const uploadFile = useCallback(async (file: File) => {
    setFileName(file.name)
    setUploadState('uploading')

    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', String(projectId))

      const res = await fetch(`${apiUrl}/api/experiments/scan-spreadsheet/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Upload failed (${res.status})`)
      }

      const data = await res.json()
      setScanId(data.scan_id)
      setPollCount(0)
      setUploadState('scanning')
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Upload failed')
    }
  }, [getToken, apiUrl, projectId])

  // Polling effect
  useEffect(() => {
    if (uploadState !== 'scanning' || !scanId) return

    intervalRef.current = setInterval(async () => {
      setPollCount((prev) => {
        if (prev >= MAX_POLLS) {
          clearInterval(intervalRef.current!)
          handleError('Scan timed out after 2 minutes. Please try again.')
          return prev
        }
        return prev + 1
      })

      try {
        const token = await getToken()
        const res = await fetch(`${apiUrl}/api/experiments/scan-status/${scanId}/`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          clearInterval(intervalRef.current!)
          const data = await res.json().catch(() => ({}))
          handleError(data.error || `Status check failed (${res.status})`)
          return
        }

        const data = await res.json()

        if (data.status === 'completed') {
          clearInterval(intervalRef.current!)
          const results = data.results as ClassifiedData
          // Default time_unit to 'hours' if classifier didn't provide it
          results.products = results.products.map(p => ({ ...p, time_unit: p.time_unit || 'hours' }))
          results.secondary_products = results.secondary_products.map(p => ({ ...p, time_unit: p.time_unit || 'hours' }))
          results.process_data = results.process_data.map(p => ({ ...p, time_unit: p.time_unit || 'hours' }))
          setClassifiedData(results)
          setUploadState('classified')
        } else if (data.status === 'failed') {
          clearInterval(intervalRef.current!)
          console.error('Spreadsheet scan failed:', data)
          handleError(data.error_message || data.error || 'Spreadsheet scan failed')
        }
      } catch (err) {
        clearInterval(intervalRef.current!)
        handleError(err instanceof Error ? err.message : 'Status check failed')
      }
    }, 2500)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [uploadState, scanId, getToken, apiUrl])

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.csv'))) {
      uploadFile(file)
    } else {
      handleError('Please upload an .xlsx or .csv file')
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragActive(true)
  }

  const handleDragLeave = () => {
    setIsDragActive(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  const handleNext = () => {
    if (!classifiedData) return

    const filtered: ClassifiedData = {
      products: classifiedData.products.filter((p) => !deselectedProducts.has(p.column_header)),
      secondary_products: classifiedData.secondary_products.filter(
        (p) => !deselectedSecondary.has(p.column_header)
      ),
      process_data: classifiedData.process_data.filter(
        (p) => !deselectedProcess.has(p.column_header)
      ),
      ignored: classifiedData.ignored,
    }

    onClassified(filtered)
  }

  const totalColumns =
    (classifiedData?.products.length ?? 0) +
    (classifiedData?.secondary_products.length ?? 0) +
    (classifiedData?.process_data.length ?? 0)

  const hasPreviewData = !!(primaryGrid?.names.length || secondaryGrid?.names.length || processGrid?.names.length)

  const renderDataPreview = () => {
    if (!hasPreviewData) return null
    return (
      <div className="mt-6">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {PREVIEW_TABS.map(({ key, label }) => {
            const grid = key === 'primary-products' ? primaryGrid : key === 'secondary-products' ? secondaryGrid : processGrid
            if (!grid || grid.names.length === 0) return null
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPreviewTab(key)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  previewTab === key
                    ? 'border-b-2 border-[#eb5234] text-[#eb5234]'
                    : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="pt-4">
          {previewTab === 'primary-products' && primaryGrid && primaryGrid.names.length > 0 && (
            <SpreadsheetGrid
              grid={primaryGrid}
              onChange={classifiedData ? () => {} : (g) => setBaselinePrimary(g)}
              readOnly={!!classifiedData}
              truncated={!!classifiedData}
              showAddRow={!classifiedData}
              showAddColumn={!classifiedData}
            />
          )}
          {previewTab === 'secondary-products' && secondaryGrid && secondaryGrid.names.length > 0 && (
            <SpreadsheetGrid
              grid={secondaryGrid}
              onChange={classifiedData ? () => {} : (g) => setBaselineSecondary(g)}
              readOnly={!!classifiedData}
              truncated={!!classifiedData}
              showAddRow={!classifiedData}
              showAddColumn={!classifiedData}
            />
          )}
          {previewTab === 'process-data' && processGrid && processGrid.names.length > 0 && (
            <SpreadsheetGrid
              grid={processGrid}
              onChange={classifiedData ? () => {} : (g) => setBaselineProcess(g)}
              readOnly={!!classifiedData}
              truncated={!!classifiedData}
              showAddRow={!classifiedData}
              showAddColumn={!classifiedData}
            />
          )}
        </div>
      </div>
    )
  }

  // ---- Idle state ----
  if (uploadState === 'idle') {
    return (
      <div>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
          ].join(' ')}
        >
          {/* Upload icon */}
          <div className="flex justify-center mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>

          <p className="text-sm font-medium text-gray-700 mb-1">
            Drag &amp; drop your Excel spreadsheet here
          </p>
          <p className="text-xs text-gray-400 mb-4">.xlsx or .csv files</p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
            className="px-4 py-2 text-sm font-medium text-white rounded-md"
            style={{ backgroundColor: '#eb5234' }}
          >
            Browse Files
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {renderDataPreview()}

        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            Skip — Create Without Data
          </button>
        </div>
      </div>
    )
  }

  // ---- Uploading state ----
  if (uploadState === 'uploading') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <svg
          className="animate-spin h-8 w-8 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-sm text-gray-500">Uploading...</p>
      </div>
    )
  }

  // ---- Scanning state ----
  if (uploadState === 'scanning') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <svg
          className="animate-spin h-8 w-8 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-sm text-gray-500">Scanning spreadsheet...</p>
        <p className="text-xs text-gray-400">This may take up to 2 minutes</p>
      </div>
    )
  }

  // ---- Error state ----
  if (uploadState === 'error') {
    return (
      <div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 mb-4">
          <p className="text-sm font-medium">Error</p>
          <p className="text-sm mt-0.5">{errorMessage}</p>
        </div>
        <button
          type="button"
          onClick={resetToIdle}
          className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  // ---- Classified state ----
  if (uploadState === 'classified' && classifiedData) {
    const activeProducts = classifiedData.products.filter(
      (p) => !deselectedProducts.has(p.column_header)
    )
    const activeSecondary = classifiedData.secondary_products.filter(
      (p) => !deselectedSecondary.has(p.column_header)
    )
    const activeProcess = classifiedData.process_data.filter(
      (p) => !deselectedProcess.has(p.column_header)
    )

    return (
      <div>
        {/* Success banner */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">{fileName}</p>
              <p className="text-xs text-green-600 mt-0.5">
                {totalColumns} column{totalColumns !== 1 ? 's' : ''} classified
              </p>
            </div>
            <button
              type="button"
              onClick={resetToIdle}
              className="text-xs text-green-700 underline hover:text-green-900"
            >
              Replace file
            </button>
          </div>
        </div>

        {/* Products */}
        {classifiedData.products.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2 tracking-wide">
              Products
            </p>
            <div className="flex flex-wrap gap-2">
              {classifiedData.products.map((p) => {
                const isActive = !deselectedProducts.has(p.column_header)
                return (
                  <span
                    key={p.column_header}
                    className={[
                      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity',
                      isActive
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-400 line-through',
                    ].join(' ')}
                  >
                    {p.name}
                    {isActive && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeselectedProducts((prev) => {
                            const next = new Set(prev)
                            next.add(p.column_header)
                            return next
                          })
                        }
                        className="ml-0.5 hover:text-blue-600"
                        aria-label={`Remove ${p.name}`}
                      >
                        ×
                      </button>
                    )}
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeselectedProducts((prev) => {
                            const next = new Set(prev)
                            next.delete(p.column_header)
                            return next
                          })
                        }
                        className="ml-0.5 hover:text-gray-600"
                        aria-label={`Restore ${p.name}`}
                      >
                        +
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Secondary Products */}
        {classifiedData.secondary_products.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2 tracking-wide">
              Secondary Products
            </p>
            <div className="flex flex-wrap gap-2">
              {classifiedData.secondary_products.map((p) => {
                const isActive = !deselectedSecondary.has(p.column_header)
                return (
                  <span
                    key={p.column_header}
                    className={[
                      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity',
                      isActive
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-gray-100 text-gray-400 line-through',
                    ].join(' ')}
                  >
                    {p.name}
                    {isActive && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeselectedSecondary((prev) => {
                            const next = new Set(prev)
                            next.add(p.column_header)
                            return next
                          })
                        }
                        className="ml-0.5 hover:text-amber-600"
                        aria-label={`Remove ${p.name}`}
                      >
                        ×
                      </button>
                    )}
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeselectedSecondary((prev) => {
                            const next = new Set(prev)
                            next.delete(p.column_header)
                            return next
                          })
                        }
                        className="ml-0.5 hover:text-gray-600"
                        aria-label={`Restore ${p.name}`}
                      >
                        +
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Process Data */}
        {classifiedData.process_data.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2 tracking-wide">
              Process Data
            </p>
            <div className="flex flex-wrap gap-2">
              {classifiedData.process_data.map((p) => {
                const isActive = !deselectedProcess.has(p.column_header)
                return (
                  <span
                    key={p.column_header}
                    className={[
                      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity',
                      isActive
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-gray-100 text-gray-400 line-through',
                    ].join(' ')}
                  >
                    {p.name}
                    {isActive && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeselectedProcess((prev) => {
                            const next = new Set(prev)
                            next.add(p.column_header)
                            return next
                          })
                        }
                        className="ml-0.5 hover:text-purple-600"
                        aria-label={`Remove ${p.name}`}
                      >
                        ×
                      </button>
                    )}
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeselectedProcess((prev) => {
                            const next = new Set(prev)
                            next.delete(p.column_header)
                            return next
                          })
                        }
                        className="ml-0.5 hover:text-gray-600"
                        aria-label={`Restore ${p.name}`}
                      >
                        +
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Ignored columns */}
        {classifiedData.ignored.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2 tracking-wide">
              Ignored
            </p>
            <div className="flex flex-wrap gap-2">
              {classifiedData.ignored.map((col) => (
                <span
                  key={col}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        )}

        {renderDataPreview()}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={
              activeProducts.length === 0 &&
              activeSecondary.length === 0 &&
              activeProcess.length === 0
            }
            className="px-5 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            style={{ backgroundColor: '#eb5234' }}
          >
            Next: Review Data →
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default Step2Upload
