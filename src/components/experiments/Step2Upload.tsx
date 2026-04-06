'use client'

import React, { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

export interface ClassifiedData {
  products: { name: string; column_header: string; unit: string; data_type: string; time_unit: string; data: { timepoint: string; value: number }[] }[]
  secondary_products: { name: string; column_header: string; unit: string; type: string; data_type: string; time_unit: string; data: { timepoint: string; value: number }[] }[]
  process_data: { name: string; column_header: string; unit: string; type: string; data_type: string; time_unit: string; data: { time: string; value: number }[] }[]
  ignored: string[]
}

interface SheetConfig {
  sheet_name: string
  start_row: number
  timepoint_column: string
  time_unit: string
  column_mappings: { column: string; name: string; category: string; unit: string }[]
}

interface DataTemplate {
  id: number
  name: string
  sheets: SheetConfig[]
  // Legacy fields
  sheet_name: string
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

function parseSheetWithConfig(
  workbook: XLSX.WorkBook,
  sheetConfig: SheetConfig,
  warnings: string[],
): { products: ClassifiedData['products']; secondary_products: ClassifiedData['secondary_products']; process_data: ClassifiedData['process_data']; missing: string[] } {
  const sheetLabel = sheetConfig.sheet_name || 'Default'

  // Resolve which workbook sheet to use
  let sheetName: string
  if (sheetConfig.sheet_name && workbook.SheetNames.includes(sheetConfig.sheet_name)) {
    sheetName = sheetConfig.sheet_name
  } else if (sheetConfig.sheet_name && !workbook.SheetNames.includes(sheetConfig.sheet_name)) {
    warnings.push(`Sheet "${sheetConfig.sheet_name}" not found. Available: ${workbook.SheetNames.join(', ')}.`)
    sheetName = workbook.SheetNames[0]
  } else {
    sheetName = workbook.SheetNames[0]
  }

  const sheet = workbook.Sheets[sheetName]
  const jsonData: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  const products: ClassifiedData['products'] = []
  const secondaryProducts: ClassifiedData['secondary_products'] = []
  const processData: ClassifiedData['process_data'] = []
  const missing: string[] = []

  if (jsonData.length < 2) {
    warnings.push(`Sheet "${sheetLabel}" has no data rows.`)
    return { products, secondary_products: secondaryProducts, process_data: processData, missing }
  }

  // start_row is 1-based; convert to 0-based index
  const headerRowIdx = Math.max(0, (sheetConfig.start_row || 1) - 1)

  const timepointColIdx = columnLetterToIndex(sheetConfig.timepoint_column)
  const headerRow = jsonData[headerRowIdx] ?? []

  const resolvedMappings = sheetConfig.column_mappings.map(mapping => {
    const colIdx = columnLetterToIndex(mapping.column)
    if (colIdx >= headerRow.length || headerRow[colIdx] === null || headerRow[colIdx] === undefined) {
      missing.push(`${mapping.name} (column ${mapping.column} in "${sheetLabel}")`)
    }
    return { ...mapping, colIdx }
  })

  const dataRows = jsonData.slice(headerRowIdx + 1)

  for (const mapping of resolvedMappings) {
    const { colIdx, name, category, unit } = mapping

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
        name, column_header: name, unit, data_type: dataType, time_unit: sheetConfig.time_unit,
        data: rawPairs.map(p => ({ timepoint: p.tp, value: p.val })),
      })
    } else if (category === 'secondary_product') {
      secondaryProducts.push({
        name, column_header: name, unit, type: name, data_type: dataType, time_unit: sheetConfig.time_unit,
        data: rawPairs.map(p => ({ timepoint: p.tp, value: p.val })),
      })
    } else if (category === 'process_data') {
      processData.push({
        name, column_header: name, unit, type: name, data_type: dataType, time_unit: sheetConfig.time_unit,
        data: rawPairs.map(p => ({ time: p.tp, value: p.val })),
      })
    }
  }

  return { products, secondary_products: secondaryProducts, process_data: processData, missing }
}

interface AccumulatedUpload {
  fileName: string
  templateName: string
  data: ClassifiedData
}

export function Step2Upload({ onClassified, onBack, onSkip, projectId, dataTemplates }: Step2UploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ClassifiedData | null>(null)
  const [missingColumns, setMissingColumns] = useState<string[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [accumulatedUploads, setAccumulatedUploads] = useState<AccumulatedUpload[]>([])

  const selectedTemplate = dataTemplates.find(t => t.id === selectedTemplateId) ?? null

  const parseFile = useCallback((file: File, template: DataTemplate) => {
    setParseError(null)
    setMissingColumns([])
    setParsedData(null)
    setParseWarnings([])
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result
        if (!arrayBuffer) throw new Error('Failed to read file')

        const workbook = XLSX.read(arrayBuffer, { type: 'array' })

        // Use sheets array; fall back to legacy single-sheet fields
        const sheets: SheetConfig[] = template.sheets && template.sheets.length > 0
          ? template.sheets
          : [{
              sheet_name: template.sheet_name || '',
              start_row: 1,
              timepoint_column: template.timepoint_column,
              time_unit: template.time_unit,
              column_mappings: template.column_mappings,
            }]

        const allProducts: ClassifiedData['products'] = []
        const allSecondary: ClassifiedData['secondary_products'] = []
        const allProcess: ClassifiedData['process_data'] = []
        const allMissing: string[] = []
        const warnings: string[] = []

        for (const sheetConfig of sheets) {
          const result = parseSheetWithConfig(workbook, sheetConfig, warnings)
          allProducts.push(...result.products)
          allSecondary.push(...result.secondary_products)
          allProcess.push(...result.process_data)
          allMissing.push(...result.missing)
        }

        setMissingColumns(allMissing)
        setParseWarnings(warnings)

        setParsedData({
          products: allProducts,
          secondary_products: allSecondary,
          process_data: allProcess,
          ignored: [],
        })
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

  const handleAddUpload = useCallback(() => {
    if (!parsedData || !selectedTemplate || !fileName) return
    setAccumulatedUploads(prev => [...prev, {
      fileName,
      templateName: selectedTemplate.name,
      data: parsedData,
    }])
    // Reset for next upload
    setParsedData(null)
    setFileName(null)
    setSelectedTemplateId(null)
    setMissingColumns([])
    setParseError(null)
    setParseWarnings([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [parsedData, selectedTemplate, fileName])

  const handleRemoveUpload = useCallback((index: number) => {
    setAccumulatedUploads(prev => prev.filter((_, i) => i !== index))
  }, [])

  const mergeAllData = useCallback((): ClassifiedData => {
    const all = accumulatedUploads.map(u => u.data)
    return {
      products: all.flatMap(d => d.products),
      secondary_products: all.flatMap(d => d.secondary_products),
      process_data: all.flatMap(d => d.process_data),
      ignored: all.flatMap(d => d.ignored),
    }
  }, [accumulatedUploads])

  const totalItems = parsedData
    ? parsedData.products.length + parsedData.secondary_products.length + parsedData.process_data.length
    : 0

  const accumulatedTotalItems = accumulatedUploads.reduce((sum, u) =>
    sum + u.data.products.length + u.data.secondary_products.length + u.data.process_data.length, 0)

  // Build template info summary
  const templateSheets = selectedTemplate
    ? (selectedTemplate.sheets && selectedTemplate.sheets.length > 0 ? selectedTemplate.sheets : null)
    : null

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
              setParseWarnings([])
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
      {selectedTemplate && templateSheets && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-600 space-y-1">
          {templateSheets.map((s, idx) => {
            const label = s.sheet_name || 'Default'
            return (
              <div key={idx}>
                <span className="font-medium text-gray-700">Sheet:</span> {label} &middot;{' '}
                <span className="font-medium text-gray-700">Timepoint:</span> {s.timepoint_column} &middot;{' '}
                <span className="font-medium text-gray-700">Time unit:</span> {s.time_unit} &middot;{' '}
                <span className="font-medium text-gray-700">Columns:</span> {s.column_mappings.length}
              </div>
            )
          })}
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

      {/* Parse Warnings */}
      {parseWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-700">
          {parseWarnings.map((w, i) => <div key={i}>{w}</div>)}
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

      {/* Accumulated Uploads */}
      {accumulatedUploads.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Uploaded Files ({accumulatedUploads.length})
          </h3>
          <div className="flex flex-col gap-2">
            {accumulatedUploads.map((upload, idx) => {
              const itemCount = upload.data.products.length + upload.data.secondary_products.length + upload.data.process_data.length
              return (
                <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-medium text-gray-700">{upload.fileName}</span>
                    <span className="text-gray-400">&middot;</span>
                    <span className="text-gray-500">{upload.templateName}</span>
                    <span className="text-gray-400">&middot;</span>
                    <span className="text-gray-500">{itemCount} series</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveUpload(idx)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
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
          {parsedData && totalItems > 0 && (
            <button
              type="button"
              onClick={handleAddUpload}
              className="px-5 py-2 text-sm font-medium border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
            >
              + Add &amp; Upload Another
            </button>
          )}
          {accumulatedUploads.length === 0 && !parsedData && (
            <button
              type="button"
              onClick={onSkip}
              className="px-5 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-md shadow-xs hover:bg-gray-100 transition-all"
            >
              Skip (no data)
            </button>
          )}
          {(accumulatedUploads.length > 0 || (parsedData && totalItems > 0)) && (
            <button
              type="button"
              onClick={() => {
                // If there's current parsed data not yet added, include it
                if (parsedData && totalItems > 0) {
                  const finalUploads = [...accumulatedUploads, {
                    fileName: fileName!,
                    templateName: selectedTemplate!.name,
                    data: parsedData,
                  }]
                  const merged: ClassifiedData = {
                    products: finalUploads.flatMap(u => u.data.products),
                    secondary_products: finalUploads.flatMap(u => u.data.secondary_products),
                    process_data: finalUploads.flatMap(u => u.data.process_data),
                    ignored: finalUploads.flatMap(u => u.data.ignored),
                  }
                  onClassified(merged)
                } else {
                  onClassified(mergeAllData())
                }
              }}
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
