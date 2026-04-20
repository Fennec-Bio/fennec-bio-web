'use client'

import React, { useState } from 'react'
import { ClassifiedData } from './Step2Upload'
import { SpreadsheetGrid, GridData } from './SpreadsheetGrid'
import { DataChart } from './DataChart'
import { Step1Details } from './Step1Details'

interface Step3ReviewProps {
  classifiedData: ClassifiedData
  onDataChange: (data: ClassifiedData) => void
  title: string
  onTitleChange: (title: string) => void
  variables: { name: string; value: string }[]
  onVariablesChange: (vars: { name: string; value: string }[]) => void
  events: { name: string; timepoint: string }[]
  onEventsChange: (evts: { name: string; timepoint: string }[]) => void
  anomalies: { name: string; timepoint: string; description: string }[]
  onAnomaliesChange: (anoms: { name: string; timepoint: string; description: string }[]) => void
  uniqueNames: {
    variables: Record<string, string[]>
    events: string[]
    anomalies: string[]
  }
  experimentSummary: string
  onExperimentSummaryChange: (summary: string) => void
  experimentNote: string
  onExperimentNoteChange: (note: string) => void
  experimentDate: string
  onExperimentDateChange: (date: string) => void
  noteImages: File[]
  onNoteImagesChange: (images: File[]) => void
  onBack: () => void
  onCreate: () => void
  isCreating: boolean
}

type TabKey = 'details' | 'products' | 'secondary_products' | 'process_data'

export function Step3Review({
  classifiedData,
  onDataChange,
  title,
  onTitleChange,
  variables,
  onVariablesChange,
  events,
  onEventsChange,
  anomalies,
  onAnomaliesChange,
  uniqueNames,
  experimentSummary,
  onExperimentSummaryChange,
  experimentNote,
  onExperimentNoteChange,
  experimentDate,
  onExperimentDateChange,
  noteImages,
  onNoteImagesChange,
  onBack,
  onCreate,
  isCreating,
}: Step3ReviewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('details')
  const [visibleCharts, setVisibleCharts] = useState<Set<string>>(new Set())

  const variableCount = variables.filter(v => v.name.trim() !== '').length
  const eventCount = events.filter(e => e.name.trim() !== '').length

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'details', label: 'Experiment Details', count: variableCount + eventCount },
    { key: 'products', label: 'Products', count: classifiedData.products.length },
    { key: 'secondary_products', label: 'Secondary Products', count: classifiedData.secondary_products.length },
    { key: 'process_data', label: 'Process Data', count: classifiedData.process_data.length },
  ]

  const toggleChart = (key: string) => {
    setVisibleCharts(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // --- Products ---
  const handleRemoveProduct = (columnHeader: string) => {
    onDataChange({
      ...classifiedData,
      products: classifiedData.products.filter(p => p.column_header !== columnHeader),
    })
  }

  const handleProductGridChange = (columnHeader: string, grid: GridData) => {
    onDataChange({
      ...classifiedData,
      products: classifiedData.products.map(p => {
        if (p.column_header !== columnHeader) return p
        return {
          ...p,
          data: grid.rows.map(r => ({
            timepoint: r.timepoint,
            value: parseFloat(r.values[0]) || 0,
          })),
        }
      }),
    })
  }

  // --- Secondary Products ---
  const handleRemoveSecondary = (columnHeader: string) => {
    onDataChange({
      ...classifiedData,
      secondary_products: classifiedData.secondary_products.filter(p => p.column_header !== columnHeader),
    })
  }

  const handleSecondaryGridChange = (columnHeader: string, grid: GridData) => {
    onDataChange({
      ...classifiedData,
      secondary_products: classifiedData.secondary_products.map(p => {
        if (p.column_header !== columnHeader) return p
        return {
          ...p,
          data: grid.rows.map(r => ({
            timepoint: r.timepoint,
            value: parseFloat(r.values[0]) || 0,
          })),
        }
      }),
    })
  }

  // --- Process Data ---
  const handleRemoveProcess = (columnHeader: string) => {
    onDataChange({
      ...classifiedData,
      process_data: classifiedData.process_data.filter(p => p.column_header !== columnHeader),
    })
  }

  const handleProcessGridChange = (columnHeader: string, grid: GridData) => {
    onDataChange({
      ...classifiedData,
      process_data: classifiedData.process_data.map(p => {
        if (p.column_header !== columnHeader) return p
        return {
          ...p,
          data: grid.rows.map(r => ({
            time: r.timepoint,
            value: parseFloat(r.values[0]) || 0,
          })),
        }
      }),
    })
  }

  // Point items are time-independent scalars — render a single Value field
  // (no time) instead of the spreadsheet grid used for time-series data.
  // The stored timepoint is pinned to '0' / 0 since it has no meaning here.
  const updatePointValue = (
    category: 'products' | 'secondary_products' | 'process_data',
    columnHeader: string,
    nextValue: string
  ) => {
    const numVal = parseFloat(nextValue)
    const valueOrZero = isNaN(numVal) ? 0 : numVal
    onDataChange({
      ...classifiedData,
      [category]: classifiedData[category].map((item: any) => {
        if (item.column_header !== columnHeader) return item
        const row = category === 'process_data'
          ? { time: '0', value: valueOrZero }
          : { timepoint: '0', value: valueOrZero }
        return { ...item, data: [row] }
      }),
    })
  }

  const PointFields = ({
    category,
    columnHeader,
    value,
    unit,
  }: {
    category: 'products' | 'secondary_products' | 'process_data'
    columnHeader: string
    value: string
    unit: string
  }) => (
    <div className="flex flex-col">
      <label className="text-xs font-medium text-gray-500 mb-1">Value{unit ? ` (${unit})` : ''}</label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={e => updatePointValue(category, columnHeader, e.target.value)}
        className="w-32 border border-gray-200 rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  const buildSingleColumnGrid = (
    name: string,
    data: { timepoint?: string; time?: string; value: number }[]
  ): GridData => ({
    names: [name],
    rows: data.map(d => ({
      timepoint: d.timepoint ?? d.time ?? '',
      values: [d.value.toFixed(2)],
    })),
  })

  const getValueRange = (data: { value: number }[]): string => {
    if (data.length === 0) return 'no data'
    const values = data.map(d => d.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return `${min.toFixed(2)} – ${max.toFixed(2)}`
  }

  const dataTypeBadgeClass = (dt: string): string => {
    if (dt === 'continuous') return 'bg-blue-100 text-blue-800'
    if (dt === 'point') return 'bg-purple-100 text-purple-800'
    return 'bg-green-100 text-green-800'
  }

  const dataTypeLabel = (dt: string): string => {
    if (dt === 'continuous') return 'Continuous'
    if (dt === 'point') return 'Point'
    return 'Discrete'
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-[#eb5234] text-[#eb5234]'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-col gap-6">
        {activeTab === 'details' && (
          <Step1Details
            title={title}
            onTitleChange={onTitleChange}
            experimentDate={experimentDate}
            onExperimentDateChange={onExperimentDateChange}
            strains={[]}
            selectedStrain=""
            onStrainChange={() => {}}
            variables={variables}
            onVariablesChange={onVariablesChange}
            events={events}
            onEventsChange={onEventsChange}
            anomalies={anomalies}
            onAnomaliesChange={onAnomaliesChange}
            uniqueNames={uniqueNames}
            experimentSummary={experimentSummary}
            onExperimentSummaryChange={onExperimentSummaryChange}
            experimentNote={experimentNote}
            onExperimentNoteChange={onExperimentNoteChange}
            noteImages={noteImages}
            onNoteImagesChange={onNoteImagesChange}
            mediaOptions={[]}
            batchMediaId={null}
            onBatchMediaChange={() => {}}
            feedMediaId={null}
            onFeedMediaChange={() => {}}
          />
        )}

        {activeTab === 'products' && (
          <>
            {classifiedData.products.length === 0 && (
              <p className="text-sm text-gray-400 py-4">No products.</p>
            )}
            {classifiedData.products.map(item => {
              const chartKey = `product:${item.column_header}`
              const isChartVisible = visibleCharts.has(chartKey)
              const grid = buildSingleColumnGrid(item.name, item.data)
              const isTruncated = item.data.length > 50
              return (
                <div key={item.column_header} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 flex-wrap">
                    <span className="font-bold text-sm text-gray-900">{item.name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${dataTypeBadgeClass(item.data_type)}`}>
                      {dataTypeLabel(item.data_type)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.data.length} point{item.data.length !== 1 ? 's' : ''} &middot; {getValueRange(item.data)} {item.unit}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleChart(chartKey)}
                        className="px-3 py-1 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        {isChartVisible ? 'Hide Graph' : 'Show Graph'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(item.column_header)}
                        className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {isChartVisible && (
                      <DataChart
                        data={item.data}
                        name={item.name}
                        unit={item.unit}
                        dataType={item.data_type}
                      />
                    )}
                    {item.data_type === 'point' ? (
                      <PointFields
                        category="products"
                        columnHeader={item.column_header}
                        value={String(item.data[0]?.value ?? '')}
                        unit={item.unit}
                      />
                    ) : (
                      <SpreadsheetGrid
                        grid={grid}
                        onChange={newGrid => handleProductGridChange(item.column_header, newGrid)}
                        readOnly={isTruncated}
                        truncated={isTruncated}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {activeTab === 'secondary_products' && (
          <>
            {classifiedData.secondary_products.length === 0 && (
              <p className="text-sm text-gray-400 py-4">No secondary products.</p>
            )}
            {classifiedData.secondary_products.map(item => {
              const chartKey = `secondary:${item.column_header}`
              const isChartVisible = visibleCharts.has(chartKey)
              const grid = buildSingleColumnGrid(item.name, item.data)
              const isTruncated = item.data.length > 50
              return (
                <div key={item.column_header} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 flex-wrap">
                    <span className="font-bold text-sm text-gray-900">{item.name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${dataTypeBadgeClass(item.data_type)}`}>
                      {dataTypeLabel(item.data_type)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.data.length} point{item.data.length !== 1 ? 's' : ''} &middot; {getValueRange(item.data)} {item.unit}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleChart(chartKey)}
                        className="px-3 py-1 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        {isChartVisible ? 'Hide Graph' : 'Show Graph'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveSecondary(item.column_header)}
                        className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {isChartVisible && (
                      <DataChart
                        data={item.data}
                        name={item.name}
                        unit={item.unit}
                        dataType={item.data_type}
                      />
                    )}
                    {item.data_type === 'point' ? (
                      <PointFields
                        category="secondary_products"
                        columnHeader={item.column_header}
                        value={String(item.data[0]?.value ?? '')}
                        unit={item.unit}
                      />
                    ) : (
                      <SpreadsheetGrid
                        grid={grid}
                        onChange={newGrid => handleSecondaryGridChange(item.column_header, newGrid)}
                        readOnly={isTruncated}
                        truncated={isTruncated}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {activeTab === 'process_data' && (
          <>
            {classifiedData.process_data.length === 0 && (
              <p className="text-sm text-gray-400 py-4">No process data.</p>
            )}
            {classifiedData.process_data.map(item => {
              const chartKey = `process:${item.column_header}`
              const isChartVisible = visibleCharts.has(chartKey)
              // Map process_data's `time` field to `timepoint` for grid and chart
              const normalizedData = item.data.map(d => ({ timepoint: d.time, value: d.value }))
              const grid = buildSingleColumnGrid(item.name, normalizedData)
              const isTruncated = item.data.length > 50
              return (
                <div key={item.column_header} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 flex-wrap">
                    <span className="font-bold text-sm text-gray-900">{item.name}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${dataTypeBadgeClass(item.data_type)}`}>
                      {dataTypeLabel(item.data_type)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.data.length} point{item.data.length !== 1 ? 's' : ''} &middot; {getValueRange(item.data)} {item.unit}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleChart(chartKey)}
                        className="px-3 py-1 text-xs font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        {isChartVisible ? 'Hide Graph' : 'Show Graph'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveProcess(item.column_header)}
                        className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {isChartVisible && (
                      <DataChart
                        data={normalizedData}
                        name={item.name}
                        unit={item.unit}
                        dataType={item.data_type}
                      />
                    )}
                    {item.data_type === 'point' ? (
                      <PointFields
                        category="process_data"
                        columnHeader={item.column_header}
                        value={String(item.data[0]?.value ?? '')}
                        unit={item.unit}
                      />
                    ) : (
                      <SpreadsheetGrid
                        grid={grid}
                        onChange={newGrid => handleProcessGridChange(item.column_header, newGrid)}
                        readOnly={isTruncated}
                        truncated={isTruncated}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Summary bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>
            <span className="font-medium text-gray-700">Experiment:</span> {title || '—'}
          </span>
          <span>
            <span className="font-medium text-gray-700">Variables:</span> {variableCount}
          </span>
          <span>
            <span className="font-medium text-gray-700">Events:</span> {eventCount}
          </span>
          <span>
            <span className="font-medium text-gray-700">Products:</span> {classifiedData.products.length}
          </span>
          <span>
            <span className="font-medium text-gray-700">Secondary:</span> {classifiedData.secondary_products.length}
          </span>
          <span>
            <span className="font-medium text-gray-700">Process Data:</span> {classifiedData.process_data.length}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          className="px-7 py-2.5 text-sm font-semibold text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ backgroundColor: '#eb5234' }}
        >
          {isCreating ? 'Creating…' : 'Create Experiment'}
        </button>
      </div>
    </div>
  )
}

export default Step3Review
