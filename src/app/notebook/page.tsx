'use client'

import { useState, useEffect, useRef, useCallback, Suspense, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import * as d3 from 'd3'
import { ExperimentList } from '@/components/Shared/ExperimentList'

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
  data_type?: 'discrete' | 'continuous' | 'point'
  time_unit?: string
}

interface ProcessData {
  id: number
  name: string
  unit: string
  time: string
  value: number
  type?: string
  time_unit?: string
  data_type?: 'discrete' | 'continuous' | 'point'
}

interface DataPoint {
  time: number
  timepoint: string
  value: number
  name: string
  unit: string
  type: string
  dataType?: 'discrete' | 'continuous' | 'point'
}

interface PointSeries {
  name: string
  value: number
  unit: string
}

interface NoteImage {
  id: number
  gcs_url: string
  filename: string
  uploaded_at: string
}

interface Comment {
  id: number
  text: string
  author_name: string
  author_picture: string
  created_at: string
  updated_at: string
}

interface ExperimentDetail {
  experiment: {
    id: number
    title: string
    description: string
    experiment_note: string
    benchmark: string
    created_at: string
    updated_at: string
  }
  products: Product[]
  secondary_products: Product[]
  process_data: ProcessData[]
  note_images?: NoteImage[]
  comments?: Comment[]
  unique_names?: {
    products?: string[]
    secondary_products?: string[]
    process_data?: string[]
  }
}

function parseTimepoint(timepoint: string | number): number {
  if (typeof timepoint === 'number') return timepoint
  const hhmmss = timepoint.match(/^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  if (hhmmss) return parseInt(hhmmss[1]) + parseInt(hhmmss[2]) / 60 + parseFloat(hhmmss[3]) / 3600

  const match = timepoint.match(/(\d+(?:\.\d+)?)\s*(hr|hours?|h|min|minutes?|m|days?|d)/i)
  if (match) {
    const num = parseFloat(match[1])
    const unit = match[2].toLowerCase()
    if (unit.includes('min') || unit === 'm') return num / 60
    if (unit.includes('day') || unit === 'd') return num * 24
    return num
  }
  const num = parseFloat(timepoint)
  return isNaN(num) ? 0 : num
}

function normalizeToHours(rawTime: number, timeUnit?: string): number {
  if (timeUnit === 'minutes') return rawTime / 60
  if (timeUnit === 'days') return rawTime * 24
  return rawTime
}

function normalizeWallClockSeries(dataPoints: DataPoint[]): void {
  const groups = new Map<string, DataPoint[]>()
  for (const dp of dataPoints) {
    if (!groups.has(dp.name)) groups.set(dp.name, [])
    groups.get(dp.name)!.push(dp)
  }
  for (const [, points] of groups) {
    const isHHMMSS = points.some(p => /^\d{1,2}:\d{2}:\d{2}(?:\.\d+)?$/.test(p.timepoint))
    if (!isHHMMSS) continue
    for (let i = 1; i < points.length; i++) {
      while (points[i].time < points[i - 1].time - 12) points[i].time += 24
    }
    const minTime = Math.min(...points.map(p => p.time))
    for (const p of points) p.time -= minTime
  }
}

// Module-level cache so switching between experiments is instant on revisit
const notebookExperimentCache = new Map<string, ExperimentDetail>()

function decimateData<T>(data: T[], maxPoints: number = 1000): T[] {
  if (data.length <= maxPoints) return data
  const step = Math.ceil(data.length / maxPoints)
  const result: T[] = [data[0]]
  for (let i = step; i < data.length - step; i += step) result.push(data[i])
  if (result[result.length - 1] !== data[data.length - 1]) result.push(data[data.length - 1])
  return result
}

function Notes({ selectedExperiment }: { selectedExperiment: Experiment | null }) {
  const { getToken } = useAuth()
  const [data, setData] = useState<ExperimentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(true)
  const [attachmentsOpen, setAttachmentsOpen] = useState(true)
  const [editingDescription, setEditingDescription] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [imageToDelete, setImageToDelete] = useState<NoteImage | null>(null)
  const [deletingImage, setDeletingImage] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedExperiment) return
    const title = selectedExperiment.title
    // Cache key by id+title — titles are not unique within an org and a
    // title-only key would collide between distinct experiments.
    const cacheKey = `${selectedExperiment.id}:${title}`

    // Instant revisit from cache
    const cached = notebookExperimentCache.get(cacheKey)
    if (cached) {
      setData(cached)
      setLoading(false)
      return
    }

    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      try {
        const token = await getToken()
        // Match QuickGraph: request only needed fields, decimate process_data,
        // and pass ?id= so the backend disambiguates duplicate-title experiments.
        const url = `${process.env.NEXT_PUBLIC_API_URL}/api/experiment/title/${encodeURIComponent(title)}/?id=${selectedExperiment.id}&fields=products,secondary_products,process_data,note_images,comments,unique_names&max_points=200`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('Failed to fetch')
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          notebookExperimentCache.set(cacheKey, json)
        }
      } catch (err) {
        console.error('Error fetching experiment:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [selectedExperiment, getToken])

  // Set default selections when data loads
  useEffect(() => {
    if (!data) return
    const defaults: Record<string, boolean> = {}
    data.unique_names?.products?.forEach(n => { defaults[n] = true })
    data.unique_names?.secondary_products?.forEach(n => { defaults[n] = false })
    data.unique_names?.process_data?.forEach(n => { defaults[n] = false })
    setSelected(defaults)
  }, [data])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.metabolites-dropdown')) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const buildDataPoints = useCallback((): { plot: DataPoint[]; points: PointSeries[] } => {
    if (!data) return { plot: [], points: [] }

    const productData = [
      ...data.products.map(p => ({ ...p, type: 'product' })),
      ...data.secondary_products.map(p => ({ ...p, type: 'secondary_product' })),
    ]
      .filter(p => selected[p.name])
      .map(p => {
        const rawTime = p.data_type === 'continuous' ? parseFloat(p.timepoint) : parseTimepoint(p.timepoint)
        return {
          time: normalizeToHours(rawTime, p.time_unit),
          timepoint: p.timepoint,
          value: p.value,
          name: p.name,
          unit: p.unit,
          type: p.type,
          dataType: p.data_type,
        }
      })

    const processPoints = data.process_data
      .filter(p => selected[p.name])
      .map(p => ({
        time: normalizeToHours(
          p.time_unit === 'hh:mm:ss' ? parseTimepoint(p.time) : parseFloat(p.time),
          p.time_unit,
        ),
        timepoint: p.time,
        value: p.value,
        name: p.name,
        unit: p.unit,
        type: 'process_data',
        dataType: p.data_type,
      }))

    const allPoints = [...productData, ...processPoints]

    const groups = new Map<string, DataPoint[]>()
    for (const p of allPoints) {
      if (!groups.has(p.name)) groups.set(p.name, [])
      groups.get(p.name)!.push(p)
    }

    const plot: DataPoint[] = []
    const points: PointSeries[] = []
    for (const [name, rows] of groups) {
      const allPoint = rows.every(r => r.dataType === 'point')
      const anyPoint = rows.some(r => r.dataType === 'point')
      if (allPoint) {
        if (rows.length > 1) {
          console.warn(`[Notebook] point series "${name}" has ${rows.length} rows; showing only the first`)
        }
        const first = rows[0]
        points.push({ name, value: first.value, unit: first.unit })
      } else {
        if (anyPoint) {
          console.warn(`[Notebook] series "${name}" mixes 'point' and other data_types; rendering as time series`)
        }
        plot.push(...rows)
      }
    }

    normalizeWallClockSeries(plot)
    plot.sort((a, b) => a.time - b.time)
    return { plot, points }
  }, [data, selected])

  const getGraphDimensions = useCallback(() => {
    const w = containerRef.current?.clientWidth || 675
    const mobile = w < 500
    const legendSpace = mobile ? 100 : 180
    const width = Math.min(Math.max(w - legendSpace, mobile ? 280 : 420), mobile ? 500 : 750)
    return { width, height: Math.round(width * 0.72) }
  }, [])

  const renderGraph = useCallback(() => {
    if (!data || !svgRef.current || !containerRef.current) return

    d3.select(svgRef.current).selectAll('*').remove()

    const margin = { top: 20, right: 130, bottom: 50, left: 60 }
    const { width: tw, height: th } = getGraphDimensions()
    const w = tw - margin.left - margin.right
    const h = th - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr('width', tw + 150).attr('height', th)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const points = buildDataPoints().plot
    if (points.length === 0) {
      svg.append('text').attr('x', w / 2).attr('y', h / 2)
        .attr('text-anchor', 'middle').attr('fill', '#666')
        .text('No data available — select metabolites to display')
      return
    }

    const groups = d3.group(points, d => d.name)
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(groups.keys()))

    const xScale = d3.scaleLinear().domain([0, d3.max(points, d => d.time)!]).range([0, w])
    const yScale = d3.scaleLinear().domain([0, d3.max(points, d => d.value)!]).range([h, 0])
    const line = d3.line<DataPoint>().x(d => xScale(d.time)).y(d => yScale(d.value))

    svg.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(xScale).ticks(5))
    svg.append('g').call(d3.axisLeft(yScale))

    groups.forEach((pts, name) => {
      const sorted = pts.sort((a, b) => a.time - b.time)
      const display = decimateData(sorted, 1000)

      svg.append('path').datum(display).attr('fill', 'none').attr('stroke', color(name)).attr('stroke-width', 2).attr('d', line)

      if ((sorted.length <= 100 || sorted[0]?.type !== 'process_data') && sorted[0]?.dataType !== 'continuous') {
        svg.selectAll(null).data(display).enter().append('circle')
          .attr('cx', d => xScale(d.time)).attr('cy', d => yScale(d.value))
          .attr('r', 4).attr('fill', color(name)).attr('stroke', 'white').attr('stroke-width', 2)
      }
    })

    // Axis labels
    svg.append('text').attr('x', w / 2).attr('y', h + margin.bottom).attr('text-anchor', 'middle').attr('font-size', '12px').text('Time (hr)')
    svg.append('text').attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -margin.left + 20).attr('text-anchor', 'middle').attr('font-size', '12px').text('Value')

    // Legend (label includes unit when known: "CBDa (mg/L)")
    const legend = svg.append('g').attr('transform', `translate(${w + 10}, ${h / 2 - groups.size * 10})`)
    Array.from(groups.entries()).forEach(([name, pts], i) => {
      const g = legend.append('g').attr('transform', `translate(0, ${i * 20})`)
      g.append('rect').attr('width', 12).attr('height', 12).attr('fill', color(name))
      const unit = pts[0]?.unit
      const label = unit ? `${name} (${unit})` : name
      g.append('text').attr('x', 16).attr('y', 9).attr('font-size', '12px').text(label)
    })
  }, [data, selected, buildDataPoints, getGraphDimensions])

  useEffect(() => { renderGraph() }, [renderGraph])

  useEffect(() => {
    let timeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => renderGraph(), 150)
    }
    window.addEventListener('resize', handleResize)
    return () => { clearTimeout(timeout); window.removeEventListener('resize', handleResize) }
  }, [renderGraph])

  const saveField = async (field: 'description' | 'experiment_note', value: string) => {
    const experimentId = data?.experiment?.id ?? selectedExperiment?.id
    if (!experimentId) return
    setSaveError('')
    setSaving(true)
    try {
      const token = await getToken()
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/experiments/${experimentId}/`
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Failed to save (${res.status}): ${errText}`)
      }
      const json = await res.json()
      if (selectedExperiment) notebookExperimentCache.delete(`${selectedExperiment.id}:${selectedExperiment.title}`)
      setData(prev => {
        if (prev) return { ...prev, experiment: { ...prev.experiment, ...json.experiment } }
        // No fetched data yet — seed a minimal ExperimentDetail so future edits work
        return {
          experiment: json.experiment,
          products: [],
          secondary_products: [],
          process_data: [],
          note_images: [],
          comments: [],
          unique_names: { products: [], secondary_products: [], process_data: [] },
        }
      })
      if (field === 'description') setEditingDescription(false)
      else setEditingNotes(false)
    } catch (err) {
      console.error('[Notebook] Error saving:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const uploadImages = async (files: File[]) => {
    if (!data?.experiment) return
    if (files.length === 0) return
    setUploading(true)
    setSaveError('')
    try {
      const token = await getToken()
      const newImages: NoteImage[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/experiments/${data.experiment.id}/note-images/`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
        )
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}))
          throw new Error(errJson.error || `Upload failed (${res.status})`)
        }
        const json = await res.json()
        newImages.push(json.image)
      }
      if (selectedExperiment) notebookExperimentCache.delete(`${selectedExperiment.id}:${selectedExperiment.title}`)
      setData(prev => prev ? { ...prev, note_images: [...(prev.note_images || []), ...newImages] } : prev)
    } catch (err) {
      console.error('Error uploading:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const confirmDeleteImage = async () => {
    if (!data?.experiment || !imageToDelete) return
    setDeletingImage(true)
    setSaveError('')
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiments/${data.experiment.id}/note-images/${imageToDelete.id}/`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `Delete failed (${res.status})`)
      }
      if (selectedExperiment) notebookExperimentCache.delete(`${selectedExperiment.id}:${selectedExperiment.title}`)
      const deletedId = imageToDelete.id
      setData(prev => prev ? { ...prev, note_images: (prev.note_images || []).filter(img => img.id !== deletedId) } : prev)
      setImageToDelete(null)
    } catch (err) {
      console.error('Error deleting image:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to delete image')
    } finally {
      setDeletingImage(false)
    }
  }

  const postComment = async () => {
    if (!data?.experiment || !commentText.trim()) return
    setPostingComment(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiments/${data.experiment.id}/comments/`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: commentText.trim() }),
        }
      )
      if (!res.ok) throw new Error('Failed to post comment')
      const json = await res.json()
      if (selectedExperiment) notebookExperimentCache.delete(`${selectedExperiment.id}:${selectedExperiment.title}`)
      setData(prev => prev ? { ...prev, comments: [...(prev.comments || []), json.comment] } : prev)
      setCommentText('')
    } catch (err) {
      console.error('Error posting comment:', err)
    } finally {
      setPostingComment(false)
    }
  }

  const deleteComment = async (commentId: number) => {
    if (!data?.experiment) return
    try {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/experiments/${data.experiment.id}/comments/${commentId}/`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error('Failed to delete comment')
      if (selectedExperiment) notebookExperimentCache.delete(`${selectedExperiment.id}:${selectedExperiment.title}`)
      setData(prev => prev ? { ...prev, comments: (prev.comments || []).filter(c => c.id !== commentId) } : prev)
    } catch (err) {
      console.error('Error deleting comment:', err)
    }
  }

  if (!selectedExperiment) {
    return (
      <div className="w-full min-h-[600px] bg-white rounded-lg shadow p-6 flex items-center justify-center text-gray-500">
        Select an experiment from the list to view notes
      </div>
    )
  }

  const checkboxSection = (label: string, names: string[] | undefined) => {
    if (!names?.length) return null
    return (
      <div className="p-3 border-b border-gray-200 last:border-b-0">
        <h4 className="font-medium text-gray-900 mb-2 text-sm">{label}</h4>
        <div className="space-y-1">
          {names.map(name => (
            <label key={name} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected[name] || false}
                onChange={e => setSelected(prev => ({ ...prev, [name]: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{name}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-[600px] bg-white rounded-lg shadow">
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{selectedExperiment.title}</h1>

        {/* Experiment Description */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Experiment Summary</h2>
            {!editingDescription && (
              <button
                onClick={() => { setDescriptionDraft(data?.experiment?.description || ''); setEditingDescription(true) }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Edit
              </button>
            )}
          </div>
          {editingDescription ? (
            <div className="space-y-2">
              <textarea
                value={descriptionDraft}
                onChange={e => setDescriptionDraft(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
              />
              {saveError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{saveError}</div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setEditingDescription(false); setSaveError('') }}
                  className="h-8 px-3 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveField('description', descriptionDraft)}
                  disabled={saving}
                  className="h-8 px-3 rounded-md text-sm font-medium text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: '#eb5234' }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-600">{data?.experiment?.description || 'No description available'}</p>
          )}
        </div>

        {/* Experiment Notes */}
        <div className="bg-gray-50 rounded-lg">
          <button
            onClick={() => setNotesOpen(!notesOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-100 rounded-t-lg"
          >
            <span className="text-sm font-semibold text-gray-700">Experiment Notes</span>
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${notesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {notesOpen && (
            <div className="px-4 pb-4">
              {editingNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px]"
                  />
                  {saveError && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{saveError}</div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setEditingNotes(false); setSaveError('') }}
                      className="h-8 px-3 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveField('experiment_note', notesDraft)}
                      disabled={saving}
                      className="h-8 px-3 rounded-md text-sm font-medium text-white transition-all disabled:opacity-50"
                      style={{ backgroundColor: '#eb5234' }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="text-gray-600 whitespace-pre-wrap flex-1">
                    {data?.experiment?.experiment_note || 'No notes available for this experiment.'}
                  </div>
                  <button
                    onClick={() => { setNotesDraft(data?.experiment?.experiment_note || ''); setEditingNotes(true) }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attachments */}
        <div className="bg-gray-50 rounded-lg">
          <button
            onClick={() => setAttachmentsOpen(!attachmentsOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-100 rounded-t-lg"
          >
            <span className="text-sm font-semibold text-gray-700">Attachments ({data?.note_images?.length || 0})</span>
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${attachmentsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {attachmentsOpen && (
            <div className="px-4 pb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  // Snapshot the FileList into a real array BEFORE resetting
                  // the input value. Resetting the input clears the same
                  // FileList object, so an async upload that hasn't started
                  // iterating yet would otherwise see zero files.
                  const picked = e.target.files ? Array.from(e.target.files) : []
                  e.target.value = ''
                  if (picked.length) uploadImages(picked)
                }}
              />
              <div className="mb-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="h-8 px-3 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Add Images'}
                </button>
              </div>
              {data?.note_images && data.note_images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {data.note_images.map(img => {
                    const src = img.gcs_url.startsWith('http')
                      ? img.gcs_url
                      : `${process.env.NEXT_PUBLIC_API_URL}${img.gcs_url}`
                    return (
                      <div key={img.id} className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white hover:shadow-md transition-shadow">
                        <a href={src} target="_blank" rel="noopener noreferrer">
                          <img
                            src={src}
                            alt={img.filename}
                            className="w-full h-40 object-contain bg-white p-1"
                          />
                        </a>
                        <button
                          onClick={() => setImageToDelete(img)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          title="Delete image"
                        >
                          &times;
                        </button>
                        <div className="px-2 py-1.5 border-t border-gray-200">
                          <p className="text-xs text-gray-500 truncate">
                            {img.filename}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No attachments</p>
              )}
            </div>
          )}
        </div>

        {/* Graph */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Experiment Graph</h2>
            <div className="relative metabolites-dropdown">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
              >
                Metabolites
              </button>
              {dropdownOpen && data && (
                <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] max-h-80 overflow-y-auto">
                  {checkboxSection('Products', data.unique_names?.products)}
                  {checkboxSection('Secondary Products', data.unique_names?.secondary_products)}
                  {checkboxSection('Process Variables', data.unique_names?.process_data)}
                </div>
              )}
            </div>
          </div>

          <div ref={containerRef} className="w-full relative">
            {loading && (
              <div className="absolute inset-0 h-[400px] flex items-center justify-center bg-white/70 z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
              </div>
            )}
            <div className="overflow-x-auto">
              <svg ref={svgRef} />
            </div>
            {(() => {
              const { points } = buildDataPoints()
              if (points.length === 0) return null
              return (
                <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                  <div className="text-xs font-medium text-gray-500 mb-1.5">Single-point measurements</div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    {points.map(p => (
                      <div key={p.name} className="text-sm text-gray-700">
                        <span className="font-medium">{p.name}:</span>{' '}
                        <span>{p.value}{p.unit ? ` ${p.unit}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Comments */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Comments</h2>
          <div className="space-y-3">
            {data?.comments && data.comments.length > 0 ? (
              data.comments.map(comment => (
                <div key={comment.id} className="group bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-start gap-2">
                    {comment.author_picture ? (
                      <img src={comment.author_picture} alt="" className="w-7 h-7 rounded-full shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-300 shrink-0 flex items-center justify-center text-xs font-medium text-gray-600">
                        {comment.author_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{comment.author_name}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(comment.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' '}
                          {new Date(comment.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="ml-auto text-xs text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Delete
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{comment.text}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-gray-400 italic text-sm">No comments yet</p>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={postComment}
                disabled={postingComment || !commentText.trim()}
                className="h-9 px-4 py-2 rounded-md text-sm font-medium text-white shadow-xs transition-all disabled:opacity-50"
                style={{ backgroundColor: '#eb5234' }}
              >
                {postingComment ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete image confirmation modal */}
      {imageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!deletingImage) setImageToDelete(null) }}
          />
          <div className="relative bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Image</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-medium">{imageToDelete.filename}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setImageToDelete(null)}
                disabled={deletingImage}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteImage}
                disabled={deletingImage}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {deletingImage ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NotebookContent() {
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const searchParams = useSearchParams()

  // Auto-select experiment from URL query param
  useEffect(() => {
    const title = searchParams.get('experiment')
    if (title && experiments.length > 0 && !selectedExperiment) {
      const match = experiments.find(e => e.title === title)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (match) setSelectedExperiment(match)
    }
  }, [searchParams, experiments, selectedExperiment])

  const handleSelect = useCallback((experiment: Experiment) => {
    setSelectedExperiment(experiment)
    setIsMobileMenuOpen(false)
  }, [])

  const handleExperimentsChange = useCallback((exps: Experiment[]) => {
    setExperiments(exps)
  }, [])

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Mobile drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[85%] max-w-[320px] bg-white overflow-y-auto shadow-xl">
            <ExperimentList
              onExperimentSelect={handleSelect}
              onExperimentsChange={handleExperimentsChange}
              isMobileDrawer
            />
          </div>
        </div>
      )}

      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        {/* Mobile toggle */}
        <button
          className="md:hidden mb-3 h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          Experiments
        </button>

        <div className="flex flex-row gap-3 md:gap-5 lg:gap-6">
          {/* Desktop sidebar */}
          <div className="hidden md:block w-[364px] min-w-[364px] max-w-[416px] flex-shrink-0">
            <ExperimentList
              onExperimentSelect={handleSelect}
              onExperimentsChange={handleExperimentsChange}
            />
          </div>

          {/* Notes panel */}
          <div className="flex-1 min-w-0">
            <Notes selectedExperiment={selectedExperiment} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Notebook() {
  return (
    <Suspense fallback={
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <NotebookContent />
    </Suspense>
  )
}
