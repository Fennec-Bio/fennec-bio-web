'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import * as XLSX from 'xlsx'
import { SpreadsheetGrid, GridData, buildSpreadsheet } from './SpreadsheetGrid'
import { useProjectContext } from '@/hooks/useProjectContext'
import type { ClassifiedData } from './Step2Upload'

interface Experiment {
  id: number
  title: string
  description: string
  experiment_note?: string
  date?: string | null
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

interface NoteImage {
  id: number
  gcs_url: string
  filename: string
  uploaded_at: string
}

interface ExperimentDetail {
  experiment: Experiment
  products: Product[]
  secondary_products: Product[]
  process_data: Product[]
  variables: { id: number; name: string; value: string }[]
  events: { id: number; name: string; timepoint: string; value: number }[]
  anomalies: { id: number; name: string; timepoint: string; description?: string }[]
  note_images: NoteImage[]
}

interface EditExperimentProps {
  selectedExperiment: Experiment | null
}

type Tab = 'experiment-details' | 'primary-products' | 'secondary-products' | 'process-data'

const TABS: { key: Tab; label: string }[] = [
  { key: 'experiment-details', label: 'Experiment Details' },
  { key: 'primary-products', label: 'Primary Products' },
  { key: 'secondary-products', label: 'Secondary Products' },
  { key: 'process-data', label: 'Process Data' },
]

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
  sheet_name: string
  timepoint_column: string
  time_unit: string
  column_mappings: { column: string; name: string; category: string; unit: string }[]
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

const inputClass =
  'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function EditExperiment({ selectedExperiment }: EditExperimentProps) {
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const [activeTab, setActiveTab] = useState<Tab>('experiment-details')
  const [data, setData] = useState<ExperimentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [primaryEdits, setPrimaryEdits] = useState<GridData | null>(null)
  const [secondaryEdits, setSecondaryEdits] = useState<GridData | null>(null)
  const [processEdits, setProcessEdits] = useState<GridData | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Experiment Details state
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editVariables, setEditVariables] = useState<{ name: string; value: string }[]>([])
  const [editEvents, setEditEvents] = useState<{ name: string; timepoint: string }[]>([])
  const [editAnomalies, setEditAnomalies] = useState<{ name: string; timepoint: string; description: string }[]>([])
  const [noteImages, setNoteImages] = useState<NoteImage[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [strainNames, setStrainNames] = useState<string[]>([])
  const [selectedStrain, setSelectedStrain] = useState('')

  // Unique names for dropdowns
  const [uniqueNames, setUniqueNames] = useState<{
    variables: Record<string, string[]>
    events: string[]
    anomalies: string[]
  }>({ variables: {}, events: [], anomalies: [] })

  // Free-text mode tracking
  const [varNameFree, setVarNameFree] = useState<Record<number, boolean>>({})
  const [varValueFree, setVarValueFree] = useState<Record<number, boolean>>({})
  const [eventNameFree, setEventNameFree] = useState<Record<number, boolean>>({})
  const [anomalyNameFree, setAnomalyNameFree] = useState<Record<number, boolean>>({})

  // Spreadsheet upload state
  const [dataTemplates, setDataTemplates] = useState<DataTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [spreadsheetFileName, setSpreadsheetFileName] = useState<string | null>(null)
  const [parsedSpreadsheet, setParsedSpreadsheet] = useState<ClassifiedData | null>(null)
  const [spreadsheetMissing, setSpreadsheetMissing] = useState<string[]>([])
  const [spreadsheetError, setSpreadsheetError] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadingSpreadsheet, setUploadingSpreadsheet] = useState(false)
  const spreadsheetInputRef = useRef<HTMLInputElement>(null)

  const selectedTemplate = dataTemplates.find(t => t.id === selectedTemplateId) ?? null

  const selectedTitle = selectedExperiment?.title ?? null
  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  // Fetch unique names + data templates
  useEffect(() => {
    const fetchUniqueNames = async () => {
      try {
        const token = await getToken()
        const params = activeProject ? `?project_id=${activeProject.id}` : ''
        const res = await fetch(`${apiUrl}/api/uniqueNames/${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const d = await res.json()
          setUniqueNames({
            variables: d.variables ?? {},
            events: d.events ?? [],
            anomalies: d.anomalies ?? [],
          })
        }
      } catch (err) {
        console.error('Error fetching unique names:', err)
      }
    }

    const fetchTemplates = async () => {
      if (!activeProject) return
      try {
        const token = await getToken()
        const res = await fetch(`${apiUrl}/api/data-templates/?project_id=${activeProject.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) setDataTemplates(await res.json())
      } catch {
        // Non-critical
      }
    }

    const fetchStrains = async () => {
      try {
        const token = await getToken()
        const params = activeProject ? `?project_id=${activeProject.id}` : ''
        const res = await fetch(`${apiUrl}/api/strains/${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const names: string[] = (data.strains || []).map((s: { name: string }) => s.name)
          setStrainNames(names.sort((a, b) => a.localeCompare(b)))
        }
      } catch {
        // Non-critical
      }
    }

    fetchUniqueNames()
    fetchTemplates()
    fetchStrains()
  }, [getToken, apiUrl, activeProject])

  useEffect(() => {
    if (!selectedTitle) {
      setData(null)
      setPrimaryEdits(null)
      setSecondaryEdits(null)
      setProcessEdits(null)
      setEditTitle('')
      setEditNote('')
      setEditVariables([])
      setEditEvents([])
      setEditAnomalies([])
      setNoteImages([])
      setHasChanges(false)
      setVarNameFree({})
      setVarValueFree({})
      setEventNameFree({})
      setAnomalyNameFree({})
      setSelectedStrain('')
      return
    }
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      try {
        const token = await getToken()
        const res = await fetch(
          `${apiUrl}/api/experiment/title/${encodeURIComponent(selectedTitle)}/?fields=products,secondary_products,process_data,variables,events,anomalies,note_images`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok && !cancelled) {
          const detail: ExperimentDetail = await res.json()
          setData(detail)
          setPrimaryEdits(buildSpreadsheet(detail.products))
          setSecondaryEdits(buildSpreadsheet(detail.secondary_products))
          setProcessEdits(buildSpreadsheet(detail.process_data))
          setEditTitle(detail.experiment.title)
          setEditDate(detail.experiment.date || '')
          setEditNote(detail.experiment.experiment_note || '')
          setEditVariables(detail.variables.map(v => ({ name: v.name, value: v.value })))
          const strainVar = detail.variables.find(v => v.name.toLowerCase() === 'strain')
          setSelectedStrain(strainVar?.value || '')
          setEditEvents(detail.events.map(e => ({ name: e.name, timepoint: e.timepoint })))
          setEditAnomalies(detail.anomalies.map(a => ({ name: a.name, timepoint: a.timepoint, description: a.description || '' })))
          setNoteImages(detail.note_images || [])
          setHasChanges(false)
          setVarNameFree({})
          setVarValueFree({})
          setEventNameFree({})
          setAnomalyNameFree({})
        }
      } catch (err) {
        console.error('Error fetching experiment:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selectedTitle, getToken, apiUrl])

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
    e.target.value = ''
  }, [])

  // Spreadsheet + template parsing (supports multi-sheet templates)
  const parseSpreadsheetFile = useCallback((file: File, template: DataTemplate) => {
    setSpreadsheetError(null)
    setSpreadsheetMissing([])
    setParsedSpreadsheet(null)
    setSpreadsheetFileName(file.name)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target?.result
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
          const sheetLabel = sheetConfig.sheet_name || 'Default'
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

          if (jsonData.length < 2) {
            warnings.push(`Sheet "${sheetLabel}" has no data rows.`)
            continue
          }

          // start_row is 1-based; convert to 0-based index
          const headerRowIdx = Math.max(0, (sheetConfig.start_row || 1) - 1)

          const timepointColIdx = columnLetterToIndex(sheetConfig.timepoint_column)
          const headerRow = jsonData[headerRowIdx] ?? []

          const resolvedMappings = sheetConfig.column_mappings.map(mapping => {
            const colIdx = columnLetterToIndex(mapping.column)
            if (colIdx >= headerRow.length || headerRow[colIdx] === null || headerRow[colIdx] === undefined) {
              allMissing.push(`${mapping.name} (column ${mapping.column} in "${sheetLabel}")`)
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
              allProducts.push({ name, column_header: name, unit, data_type: dataType, time_unit: sheetConfig.time_unit, data: rawPairs.map(p => ({ timepoint: p.tp, value: p.val })) })
            } else if (category === 'secondary_product') {
              allSecondary.push({ name, column_header: name, unit, type: name, data_type: dataType, time_unit: sheetConfig.time_unit, data: rawPairs.map(p => ({ timepoint: p.tp, value: p.val })) })
            } else if (category === 'process_data') {
              allProcess.push({ name, column_header: name, unit, type: name, data_type: dataType, time_unit: sheetConfig.time_unit, data: rawPairs.map(p => ({ time: p.tp, value: p.val })) })
            }
          }
        }

        setSpreadsheetMissing(allMissing)
        if (warnings.length > 0) {
          setSpreadsheetError(warnings.join(' '))
        }

        setParsedSpreadsheet({ products: allProducts, secondary_products: allSecondary, process_data: allProcess, ignored: [] })
      } catch (err) {
        setSpreadsheetError(err instanceof Error ? err.message : 'Failed to parse spreadsheet')
      }
    }
    reader.onerror = () => setSpreadsheetError('Failed to read file')
    reader.readAsArrayBuffer(file)
  }, [])

  const handleSpreadsheetSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0 || !selectedTemplate) return
    parseSpreadsheetFile(files[0], selectedTemplate)
  }, [selectedTemplate, parseSpreadsheetFile])

  const handleSpreadsheetDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
    handleSpreadsheetSelect(e.dataTransfer.files)
  }, [handleSpreadsheetSelect])

  // Apply parsed spreadsheet data — overwrites existing experiment data
  const handleApplySpreadsheet = async () => {
    if (!data || !parsedSpreadsheet) return
    setUploadingSpreadsheet(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/experiments/${data.experiment.id}/`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          products: parsedSpreadsheet.products.map(p => ({
            name: p.name, unit: p.unit, data_type: p.data_type, time_unit: p.time_unit,
            data: p.data.map(d => ({ timepoint: d.timepoint, value: d.value })),
          })),
          secondary_products: parsedSpreadsheet.secondary_products.map(p => ({
            name: p.name, unit: p.unit, type: p.type, data_type: p.data_type, time_unit: p.time_unit,
            data: p.data.map(d => ({ timepoint: d.timepoint, value: d.value })),
          })),
          process_data: parsedSpreadsheet.process_data.map(p => ({
            name: p.name, unit: p.unit, type: p.type, data_type: p.data_type, time_unit: p.time_unit,
            data: p.data.map(d => ({ time: d.time, value: d.value })),
          })),
        }),
      })
      if (res.ok) {
        // Re-fetch the experiment to refresh all tabs
        const detailRes = await fetch(
          `${apiUrl}/api/experiment/title/${encodeURIComponent(data.experiment.title)}/?fields=products,secondary_products,process_data,variables,events,anomalies,note_images`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (detailRes.ok) {
          const detail: ExperimentDetail = await detailRes.json()
          setData(detail)
          setPrimaryEdits(buildSpreadsheet(detail.products))
          setSecondaryEdits(buildSpreadsheet(detail.secondary_products))
          setProcessEdits(buildSpreadsheet(detail.process_data))
        }
        // Clear upload state
        setParsedSpreadsheet(null)
        setSpreadsheetFileName(null)
        setSelectedTemplateId(null)
      } else {
        console.error('Failed to apply spreadsheet data')
      }
    } catch (err) {
      console.error('Error applying spreadsheet:', err)
    } finally {
      setUploadingSpreadsheet(false)
    }
  }

  // Details change helpers
  const markChanged = () => setHasChanges(true)

  const updateVariable = (idx: number, field: 'name' | 'value', val: string) => {
    setEditVariables(prev => prev.map((v, i) => i === idx ? { ...v, [field]: val } : v))
    markChanged()
  }

  const handleVarNameSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setVarNameFree(prev => ({ ...prev, [idx]: true }))
      updateVariable(idx, 'name', '')
    } else {
      setVarNameFree(prev => ({ ...prev, [idx]: false }))
      setEditVariables(prev => prev.map((v, i) => i === idx ? { ...v, name: val, value: '' } : v))
      setVarValueFree(prev => ({ ...prev, [idx]: false }))
      markChanged()
    }
  }

  const handleVarValueSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setVarValueFree(prev => ({ ...prev, [idx]: true }))
      updateVariable(idx, 'value', '')
    } else {
      setVarValueFree(prev => ({ ...prev, [idx]: false }))
      updateVariable(idx, 'value', val)
    }
  }

  const updateEvent = (idx: number, field: 'name' | 'timepoint', val: string) => {
    setEditEvents(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
    markChanged()
  }

  const handleEventNameSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setEventNameFree(prev => ({ ...prev, [idx]: true }))
      updateEvent(idx, 'name', '')
    } else {
      setEventNameFree(prev => ({ ...prev, [idx]: false }))
      updateEvent(idx, 'name', val)
    }
  }

  const updateAnomaly = (idx: number, field: 'name' | 'timepoint' | 'description', val: string) => {
    setEditAnomalies(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a))
    markChanged()
  }

  const handleAnomalyNameSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setAnomalyNameFree(prev => ({ ...prev, [idx]: true }))
      updateAnomaly(idx, 'name', '')
    } else {
      setAnomalyNameFree(prev => ({ ...prev, [idx]: false }))
      updateAnomaly(idx, 'name', val)
    }
  }

  const handleStrainChange = (strain: string) => {
    setSelectedStrain(strain)
    setEditVariables(prev => {
      const withoutStrain = prev.filter(v => v.name.toLowerCase() !== 'strain')
      if (strain) {
        return [...withoutStrain, { name: 'strain', value: strain }]
      }
      return withoutStrain
    })
    markChanged()
  }

  // Save experiment details
  const handleSaveDetails = async () => {
    if (!data) return
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/experiments/${data.experiment.id}/`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: editTitle,
          date: editDate || null,
          experiment_note: editNote,
          variables: editVariables,
          events: editEvents,
          anomalies: editAnomalies,
        }),
      })
      if (res.ok) {
        setHasChanges(false)
      } else {
        console.error('Failed to save experiment details')
      }
    } catch (err) {
      console.error('Error saving experiment details:', err)
    } finally {
      setSaving(false)
    }
  }

  // Upload note image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !data) return
    setUploadingImage(true)
    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${apiUrl}/api/experiments/${data.experiment.id}/note-images/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (res.ok) {
        const result = await res.json()
        setNoteImages(prev => [...prev, result.image])
      }
    } catch (err) {
      console.error('Error uploading image:', err)
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  // Delete note image
  const handleDeleteImage = async (imageId: number) => {
    if (!data) return
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/experiments/${data.experiment.id}/note-images/${imageId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setNoteImages(prev => prev.filter(img => img.id !== imageId))
      }
    } catch (err) {
      console.error('Error deleting image:', err)
    }
  }

  const handleUpdate = async () => {
    console.log('Primary edits:', primaryEdits)
    console.log('Secondary edits:', secondaryEdits)
    setHasChanges(false)
  }

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!data) return
    setDeleting(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/experiments/${data.experiment.id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        window.location.reload()
      }
    } catch {
      // silent
    } finally {
      setDeleting(false)
      setShowDeleteModal(false)
    }
  }

  const getActiveGrid = (): GridData | null => {
    if (activeTab === 'primary-products') return primaryEdits
    if (activeTab === 'secondary-products') return secondaryEdits
    if (activeTab === 'process-data') return processEdits
    return null
  }

  const isGridTab = activeTab === 'primary-products' || activeTab === 'secondary-products' || activeTab === 'process-data'

  const varNameKeys = Object.keys(uniqueNames.variables)

  const renderDetailsTab = () => {
    return (
      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Experiment Title
          </label>
          <input
            type="text"
            value={editTitle}
            onChange={(e) => { setEditTitle(e.target.value); markChanged() }}
            placeholder="e.g. Ferm 130-BO"
            className={inputClass}
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Experiment Date
          </label>
          <input
            type="date"
            value={editDate}
            onChange={(e) => { setEditDate(e.target.value); markChanged() }}
            className={inputClass}
          />
        </div>

        {/* Strain */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Strain
          </label>
          <select
            value={selectedStrain}
            onChange={(e) => {
              const val = e.target.value
              if (val === '__add_new_strain__') {
                window.open('/strains', '_blank')
              } else {
                handleStrainChange(val)
              }
            }}
            className={inputClass}
          >
            <option value="">None</option>
            {strainNames.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__add_new_strain__">Add New...</option>
          </select>
        </div>

        {/* Variables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-gray-700">Variables</span>
            <button
              type="button"
              onClick={() => { setEditVariables(prev => [...prev, { name: '', value: '' }]); markChanged() }}
              className="text-xs font-medium"
              style={{ color: '#eb5234' }}
            >
              + Add Variable
            </button>
          </div>
          {editVariables.map((variable, idx) => {
            if (variable.name.toLowerCase() === 'strain') return null
            const isNameFree = !!varNameFree[idx]
            const isValueFree = !!varValueFree[idx]
            const valueOptions = variable.name ? (uniqueNames.variables[variable.name] ?? []) : []

            return (
              <div key={idx} className="flex items-center gap-2 mb-1.5">
                <div className="flex-1">
                  {isNameFree ? (
                    <input
                      type="text"
                      value={variable.name}
                      onChange={(e) => updateVariable(idx, 'name', e.target.value)}
                      placeholder="Variable name"
                      className={inputClass}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={variable.name}
                      onChange={(e) => handleVarNameSelect(idx, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select name...</option>
                      {varNameKeys.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                      <option value="__add_new__">Add new...</option>
                    </select>
                  )}
                </div>
                <div className="flex-1">
                  {isValueFree ? (
                    <input
                      type="text"
                      value={variable.value}
                      onChange={(e) => updateVariable(idx, 'value', e.target.value)}
                      placeholder="Variable value"
                      className={inputClass}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={variable.value}
                      onChange={(e) => handleVarValueSelect(idx, e.target.value)}
                      className={inputClass}
                      disabled={!variable.name && !isNameFree}
                    >
                      <option value="">Select value...</option>
                      {valueOptions.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                      <option value="__add_new__">Add new...</option>
                    </select>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditVariables(prev => prev.filter((_, i) => i !== idx))
                    setVarNameFree(prev => { const n = { ...prev }; delete n[idx]; return n })
                    setVarValueFree(prev => { const n = { ...prev }; delete n[idx]; return n })
                    markChanged()
                  }}
                  className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
                  style={{ width: 28, height: 28 }}
                  aria-label="Remove variable"
                >
                  x
                </button>
              </div>
            )
          })}
        </div>

        {/* Events */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-gray-700">Events</span>
            <button
              type="button"
              onClick={() => { setEditEvents(prev => [...prev, { name: '', timepoint: '' }]); markChanged() }}
              className="text-xs font-medium"
              style={{ color: '#eb5234' }}
            >
              + Add Event
            </button>
          </div>
          {editEvents.map((event, idx) => {
            const isNameFree = !!eventNameFree[idx]
            return (
              <div key={idx} className="flex items-center gap-2 mb-1.5">
                <div className="flex-1">
                  {isNameFree ? (
                    <input
                      type="text"
                      value={event.name}
                      onChange={(e) => updateEvent(idx, 'name', e.target.value)}
                      placeholder="Event name"
                      className={inputClass}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={event.name}
                      onChange={(e) => handleEventNameSelect(idx, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select event...</option>
                      {uniqueNames.events.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                      <option value="__add_new__">Add new...</option>
                    </select>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={event.timepoint}
                    onChange={(e) => updateEvent(idx, 'timepoint', e.target.value)}
                    placeholder="Timepoint (h)"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditEvents(prev => prev.filter((_, i) => i !== idx))
                    setEventNameFree(prev => { const n = { ...prev }; delete n[idx]; return n })
                    markChanged()
                  }}
                  className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
                  style={{ width: 28, height: 28 }}
                  aria-label="Remove event"
                >
                  x
                </button>
              </div>
            )
          })}
        </div>

        {/* Anomalies */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-gray-700">Anomalies</span>
            <button
              type="button"
              onClick={() => { setEditAnomalies(prev => [...prev, { name: '', timepoint: '', description: '' }]); markChanged() }}
              className="text-xs font-medium"
              style={{ color: '#eb5234' }}
            >
              + Add Anomaly
            </button>
          </div>
          {editAnomalies.map((anomaly, idx) => {
            const isNameFree = !!anomalyNameFree[idx]
            return (
              <div key={idx} className="flex items-center gap-2 mb-1.5">
                <div className="flex-1">
                  {isNameFree ? (
                    <input
                      type="text"
                      value={anomaly.name}
                      onChange={(e) => updateAnomaly(idx, 'name', e.target.value)}
                      placeholder="Anomaly name"
                      className={inputClass}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={anomaly.name}
                      onChange={(e) => handleAnomalyNameSelect(idx, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select anomaly...</option>
                      {uniqueNames.anomalies.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                      <option value="__add_new__">Add new...</option>
                    </select>
                  )}
                </div>
                <div className="w-28">
                  <input
                    type="text"
                    value={anomaly.timepoint}
                    onChange={(e) => updateAnomaly(idx, 'timepoint', e.target.value)}
                    placeholder="Timepoint (h)"
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={anomaly.description}
                    onChange={(e) => updateAnomaly(idx, 'description', e.target.value)}
                    placeholder="Description"
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditAnomalies(prev => prev.filter((_, i) => i !== idx))
                    setAnomalyNameFree(prev => { const n = { ...prev }; delete n[idx]; return n })
                    markChanged()
                  }}
                  className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
                  style={{ width: 28, height: 28 }}
                  aria-label="Remove anomaly"
                >
                  x
                </button>
              </div>
            )
          })}
        </div>

        {/* Experiment Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            rows={4}
            value={editNote}
            onChange={(e) => { setEditNote(e.target.value); markChanged() }}
            placeholder="Add experiment notes, observations, or procedures..."
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-y"
          />
        </div>

        {/* Attachments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-gray-700">Attachments</span>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="text-xs font-medium"
              style={{ color: '#eb5234' }}
              disabled={uploadingImage}
            >
              {uploadingImage ? 'Uploading...' : '+ Add Image'}
            </button>
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          {noteImages.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {noteImages.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.gcs_url.startsWith('http') ? img.gcs_url : `${apiUrl}${img.gcs_url}`}
                    alt={img.filename}
                    className="w-20 h-20 rounded-lg object-cover border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    aria-label="Remove image"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

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

    if (activeTab === 'experiment-details') {
      return renderDetailsTab()
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
        />
      )
    }

    return null
  }

  const spreadsheetTotalItems = parsedSpreadsheet
    ? parsedSpreadsheet.products.length + parsedSpreadsheet.secondary_products.length + parsedSpreadsheet.process_data.length
    : 0

  return (
    <div>
      {/* Spreadsheet Upload with Data Template */}
      {selectedExperiment && data && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload Spreadsheet
              </label>
              {dataTemplates.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">
                  No templates available for this project. Create a template in the Templates section first.
                </div>
              ) : (
                <select
                  value={selectedTemplateId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null
                    setSelectedTemplateId(val)
                    setParsedSpreadsheet(null)
                    setSpreadsheetFileName(null)
                    setSpreadsheetMissing([])
                    setSpreadsheetError(null)
                  }}
                  className={inputClass}
                >
                  <option value="">Select a data template...</option>
                  {dataTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Template info */}
          {selectedTemplate && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-600 mb-3">
              <span className="font-medium text-gray-700">Timepoint column:</span> {selectedTemplate.timepoint_column} &middot;{' '}
              <span className="font-medium text-gray-700">Time unit:</span> {selectedTemplate.time_unit} &middot;{' '}
              <span className="font-medium text-gray-700">Mapped columns:</span> {selectedTemplate.column_mappings.length}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragEnter={(e) => { e.preventDefault(); if (selectedTemplate) setIsDragActive(true) }}
            onDragOver={(e) => { e.preventDefault() }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragActive(false) }}
            onDrop={handleSpreadsheetDrop}
            onClick={() => { if (selectedTemplate) spreadsheetInputRef.current?.click() }}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-all
              ${!selectedTemplate ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50' : ''}
              ${selectedTemplate && !isDragActive ? 'border-gray-300 hover:border-gray-400 cursor-pointer' : ''}
              ${isDragActive ? 'border-[#eb5234] bg-red-50' : ''}
            `}
          >
            <input
              ref={spreadsheetInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleSpreadsheetSelect(e.target.files)}
              disabled={!selectedTemplate}
            />
            <div className="flex flex-col items-center gap-1">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {spreadsheetFileName ? (
                <p className="text-sm text-gray-700 font-medium">{spreadsheetFileName}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">
                    {selectedTemplate ? 'Drop a spreadsheet here or click to browse' : 'Select a template first'}
                  </p>
                  <p className="text-xs text-gray-500">.xlsx, .xls, or .csv — this will overwrite existing data</p>
                </>
              )}
            </div>
          </div>

          {/* Parse error */}
          {spreadsheetError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mt-3">
              {spreadsheetError}
            </div>
          )}

          {/* Preview */}
          {parsedSpreadsheet && (
            <div className="border border-gray-200 rounded-lg p-4 mt-3">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Parsed {spreadsheetTotalItems} data series from {spreadsheetFileName}
              </h3>

              {spreadsheetMissing.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3 text-sm text-amber-700">
                  <span className="font-medium">Missing columns:</span>{' '}
                  {spreadsheetMissing.join(', ')}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {parsedSpreadsheet.products.map(p => (
                  <span key={`product-${p.column_header}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS.product.bg} ${CATEGORY_COLORS.product.text}`}>
                    {p.name} <span className="opacity-60">({p.data.length} pts)</span>
                  </span>
                ))}
                {parsedSpreadsheet.secondary_products.map(p => (
                  <span key={`secondary-${p.column_header}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS.secondary_product.bg} ${CATEGORY_COLORS.secondary_product.text}`}>
                    {p.name} <span className="opacity-60">({p.data.length} pts)</span>
                  </span>
                ))}
                {parsedSpreadsheet.process_data.map(p => (
                  <span key={`process-${p.column_header}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS.process_data.bg} ${CATEGORY_COLORS.process_data.text}`}>
                    {p.name} <span className="opacity-60">({p.data.length} pts)</span>
                  </span>
                ))}
              </div>

              <div className="flex gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#eb5234]" /> Product</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Secondary Product</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Process Data</span>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={handleApplySpreadsheet}
                  disabled={uploadingSpreadsheet || spreadsheetTotalItems === 0}
                  className="px-5 py-2 text-sm font-medium text-white rounded-md shadow-xs hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#eb5234' }}
                >
                  {uploadingSpreadsheet ? 'Applying...' : 'Apply & Overwrite Data'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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

        {/* Buttons */}
        {selectedExperiment && activeTab === 'experiment-details' && (
          <div className="flex justify-between mt-4">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 text-sm font-medium border border-red-300 text-red-600 rounded-md shadow-xs hover:bg-red-50 transition-all"
            >
              Delete Experiment
            </button>
            <button
              onClick={handleSaveDetails}
              disabled={!hasChanges || saving}
              className="px-6 py-2 text-sm font-medium text-white rounded-md shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: '#eb5234' }}
            >
              {saving ? 'Saving...' : 'Update'}
            </button>
          </div>
        )}
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

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteModal(false)} />
          <div className="relative bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Experiment</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-medium">{data?.experiment.title}</span>? This will remove all associated data and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditExperiment
