'use client'

import React, { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

export interface ClassifiedData {
  products: { name: string; column_header: string; unit: string; data_type: string; time_unit: string; data: { timepoint: string; value: number }[] }[]
  secondary_products: { name: string; column_header: string; unit: string; type: string; data_type: string; time_unit: string; data: { timepoint: string; value: number }[] }[]
  process_data: { name: string; column_header: string; unit: string; type: string; data_type: string; time_unit: string; data: { time: string; value: number }[] }[]
  ignored: string[]
}

interface DataTemplate {
  id: number
  name: string
  timepoint_column: string
  time_unit: string
  column_mappings: { column: string; name: string; category: string; unit: string }[]
}

interface Step2UploadProps {
  onClassified: (data: ClassifiedData) => void
  onBack: () => void
  onSkip: () => void
  projectId: number
  dataTemplates: DataTemplate[]
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  product: { bg: 'bg-red-50', text: 'text-[#eb5234]' },
  secondary_product: { bg: 'bg-blue-50', text: 'text-blue-500' },
  process_data: { bg: 'bg-emerald-50', text: 'text-emerald-500' },
}

function columnLetterToIndex(letter: string): number {
  let index = 0
  const upper = letter.toUpperCase()
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64)
  }
  return index - 1
}

export function Step2Upload({ onClassified, onBack, onSkip, projectId, dataTemplates }: Step2UploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ClassifiedData | null>(null)
  const [missingColumns, setMissingColumns] = useState<string[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const selectedTemplate = dataTemplates.find(t => t.id === selectedTemplateId) ?? null

  const parseFile = useCallback((file: File, template: DataTemplate) => {
    setParseError(null)
    setMissingColumns([])
    setParsedData(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result
        if (!arrayBuffer) throw new Error('Failed to read file')

        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

        if (jsonData.length < 2) {
          setParseError('Spreadsheet has no data rows.')
          return
        }

        // Find timepoint column
        const timepointColIdx = columnLetterToIndex(template.timepoint_column)
        const missing: string[] = []

        // Check header row for column existence
        const headerRow = jsonData[0] ?? []

        // Build mappings with resolved column indices
        const resolvedMappings = template.column_mappings.map(mapping => {
          const colIdx = columnLetterToIndex(mapping.column)
          // Check if column exists and has a header
          if (colIdx >= headerRow.length || headerRow[colIdx] === null || headerRow[colIdx] === undefined) {
            missing.push(`${mapping.name} (column ${mapping.column})`)
          }
          return { ...mapping, colIdx }
        })

        setMissingColumns(missing)

        // Parse data rows (skip header)
        const dataRows = jsonData.slice(1)

        const products: ClassifiedData['products'] = []
        const secondaryProducts: ClassifiedData['secondary_products'] = []
        const processData: ClassifiedData['process_data'] = []

        for (const mapping of resolvedMappings) {
          const { colIdx, name, category, unit } = mapping

          // Extract timepoint-value pairs, filtering out empty/non-numeric values
          const rawPairs: { tp: string; val: number }[] = []
          for (const row of dataRows) {
            const tpRaw = row[timepointColIdx]
            const valRaw = row[colIdx]
            if (tpRaw === null || tpRaw === undefined || valRaw === null || valRaw === undefined || valRaw === '') continue
            const numVal = typeof valRaw === 'number' ? valRaw : parseFloat(String(valRaw))
            if (isNaN(numVal)) continue
            rawPairs.push({ tp: String(tpRaw), val: numVal })
          }

          const dataType = rawPairs.length > 50 ? 'continuous' : 'discrete'

          if (category === 'product') {
            products.push({
              name,
              column_header: name,
              unit,
              data_type: dataType,
              time_unit: template.time_unit,
              data: rawPairs.map(p => ({ timepoint: p.tp, value: p.val })),
            })
          } else if (category === 'secondary_product') {
            secondaryProducts.push({
              name,
              column_header: name,
              unit,
              type: name,
              data_type: dataType,
              time_unit: template.time_unit,
              data: rawPairs.map(p => ({ timepoint: p.tp, value: p.val })),
            })
          } else if (category === 'process_data') {
            processData.push({
              name,
              column_header: name,
              unit,
              type: name,
              data_type: dataType,
              time_unit: template.time_unit,
              data: rawPairs.map(p => ({ time: p.tp, value: p.val })),
            })
          }
        }

        const result: ClassifiedData = {
          products,
          secondary_products: secondaryProducts,
          process_data: processData,
          ignored: [],
        }

        setParsedData(result)
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse spreadsheet')
      }
    }
    reader.onerror = () => setParseError('Failed to read file')
    reader.readAsArrayBuffer(file)
  }, [])

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0 || !selectedTemplate) return
    parseFile(files[0], selectedTemplate)
  }, [selectedTemplate, parseFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const totalItems = parsedData
    ? parsedData.products.length + parsedData.secondary_products.length + parsedData.process_data.length
    : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Template Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Data Template
        </label>
        {dataTemplates.length === 0 ? (
          <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">
            No templates available for this project. Create a template in the Templates section first, or skip this step.
          </div>
        ) : (
          <select
            value={selectedTemplateId ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null
              setSelectedTemplateId(val)
              setParsedData(null)
              setFileName(null)
              setMissingColumns([])
              setParseError(null)
            }}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a template...</option>
            {dataTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Template Info */}
      {selectedTemplate && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Timepoint column:</span> {selectedTemplate.timepoint_column} &middot;{' '}
          <span className="font-medium text-gray-700">Time unit:</span> {selectedTemplate.time_unit} &middot;{' '}
          <span className="font-medium text-gray-700">Mapped columns:</span> {selectedTemplate.column_mappings.length}
        </div>
      )}

      {/* File Upload Area */}
      <div
        onDragEnter={(e) => { e.preventDefault(); if (selectedTemplate) setIsDragActive(true) }}
        onDragOver={(e) => { e.preventDefault() }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragActive(false) }}
        onDrop={handleDrop}
        onClick={() => { if (selectedTemplate) fileInputRef.current?.click() }}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-all
          ${!selectedTemplate ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50' : ''}
          ${selectedTemplate && !isDragActive ? 'border-gray-300 hover:border-gray-400 cursor-pointer' : ''}
          ${isDragActive ? 'border-[#eb5234] bg-red-50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={!selectedTemplate}
        />
        <div className="flex flex-col items-center gap-2">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {fileName ? (
            <p className="text-sm text-gray-700 font-medium">{fileName}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">
                {selectedTemplate ? 'Drop a spreadsheet here or click to browse' : 'Select a template first'}
              </p>
              <p className="text-xs text-gray-500">.xlsx, .xls, or .csv</p>
            </>
          )}
        </div>
      </div>

      {/* Parse Error */}
      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          {parseError}
        </div>
      )}

      {/* Preview */}
      {parsedData && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Parsed {totalItems} data series from {fileName}
          </h3>

          {/* Missing columns warning */}
          {missingColumns.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3 text-sm text-amber-700">
              <span className="font-medium">Missing columns:</span>{' '}
              {missingColumns.join(', ')}
            </div>
          )}

          {/* Matched columns as chips */}
          <div className="flex flex-wrap gap-2">
            {parsedData.products.map(p => (
              <span
                key={`product-${p.column_header}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS.product.bg} ${CATEGORY_COLORS.product.text}`}
              >
                {p.name}
                <span className="opacity-60">({p.data.length} pts)</span>
              </span>
            ))}
            {parsedData.secondary_products.map(p => (
              <span
                key={`secondary-${p.column_header}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS.secondary_product.bg} ${CATEGORY_COLORS.secondary_product.text}`}
              >
                {p.name}
                <span className="opacity-60">({p.data.length} pts)</span>
              </span>
            ))}
            {parsedData.process_data.map(p => (
              <span
                key={`process-${p.column_header}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS.process_data.bg} ${CATEGORY_COLORS.process_data.text}`}
              >
                {p.name}
                <span className="opacity-60">({p.data.length} pts)</span>
              </span>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#eb5234]" /> Product
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Secondary Product
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Process Data
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
        >
          &larr; Back
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="px-5 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
          >
            Skip (no data)
          </button>
          {parsedData && totalItems > 0 && (
            <button
              type="button"
              onClick={() => onClassified(parsedData)}
              className="px-5 py-2 text-sm font-medium text-white bg-[#eb5234] rounded-md shadow-xs hover:bg-[#d4482e] transition-all"
            >
              Confirm &amp; Review &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Step2Upload
