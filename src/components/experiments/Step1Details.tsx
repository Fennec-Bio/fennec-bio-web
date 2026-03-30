'use client'

import React, { useState, useRef, useEffect } from 'react'

interface Step1DetailsProps {
  title: string
  onTitleChange: (title: string) => void
  experimentDate: string
  onExperimentDateChange: (date: string) => void
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
  noteImages: File[]
  onNoteImagesChange: (images: File[]) => void
}

const inputClass =
  'w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const selectClass = inputClass

// Tracks which fields are in "free text" mode (user chose "Add new...")
interface FreeTextState {
  [rowIndex: number]: boolean
}

export function Step1Details({
  title,
  onTitleChange,
  experimentDate,
  onExperimentDateChange,
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
  noteImages,
  onNoteImagesChange,
}: Step1DetailsProps) {
  // Ref for hidden image file input
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Object URLs for image previews — cleaned up on unmount or when images change
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  useEffect(() => {
    const urls = noteImages.map((f) => URL.createObjectURL(f))
    setPreviewUrls(urls)
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [noteImages])

  // Track which variable name/value cells are in free-text mode
  const [varNameFree, setVarNameFree] = useState<FreeTextState>({})
  const [varValueFree, setVarValueFree] = useState<FreeTextState>({})

  // Track which event/anomaly name cells are in free-text mode
  const [eventNameFree, setEventNameFree] = useState<FreeTextState>({})
  const [anomalyNameFree, setAnomalyNameFree] = useState<FreeTextState>({})

  /* ---- Variable helpers ---- */

  const addVariable = () => {
    onVariablesChange([...variables, { name: '', value: '' }])
  }

  const removeVariable = (idx: number) => {
    const updated = variables.filter((_, i) => i !== idx)
    onVariablesChange(updated)
    // Clean up free-text state for removed row
    setVarNameFree((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
    setVarValueFree((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  const updateVariable = (
    idx: number,
    field: 'name' | 'value',
    val: string
  ) => {
    const updated = variables.map((v, i) => (i === idx ? { ...v, [field]: val } : v))
    onVariablesChange(updated)
  }

  const handleVarNameSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setVarNameFree((prev) => ({ ...prev, [idx]: true }))
      updateVariable(idx, 'name', '')
    } else {
      setVarNameFree((prev) => ({ ...prev, [idx]: false }))
      // Reset value when name changes
      const updated = variables.map((v, i) =>
        i === idx ? { ...v, name: val, value: '' } : v
      )
      onVariablesChange(updated)
      setVarValueFree((prev) => ({ ...prev, [idx]: false }))
    }
  }

  const handleVarValueSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setVarValueFree((prev) => ({ ...prev, [idx]: true }))
      updateVariable(idx, 'value', '')
    } else {
      setVarValueFree((prev) => ({ ...prev, [idx]: false }))
      updateVariable(idx, 'value', val)
    }
  }

  /* ---- Event helpers ---- */

  const addEvent = () => {
    onEventsChange([...events, { name: '', timepoint: '' }])
  }

  const removeEvent = (idx: number) => {
    onEventsChange(events.filter((_, i) => i !== idx))
    setEventNameFree((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  const updateEvent = (
    idx: number,
    field: 'name' | 'timepoint',
    val: string
  ) => {
    onEventsChange(events.map((e, i) => (i === idx ? { ...e, [field]: val } : e)))
  }

  const handleEventNameSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setEventNameFree((prev) => ({ ...prev, [idx]: true }))
      updateEvent(idx, 'name', '')
    } else {
      setEventNameFree((prev) => ({ ...prev, [idx]: false }))
      updateEvent(idx, 'name', val)
    }
  }

  /* ---- Anomaly helpers ---- */

  const addAnomaly = () => {
    onAnomaliesChange([...anomalies, { name: '', timepoint: '', description: '' }])
  }

  const removeAnomaly = (idx: number) => {
    onAnomaliesChange(anomalies.filter((_, i) => i !== idx))
    setAnomalyNameFree((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  const updateAnomaly = (
    idx: number,
    field: 'name' | 'timepoint' | 'description',
    val: string
  ) => {
    onAnomaliesChange(anomalies.map((a, i) => (i === idx ? { ...a, [field]: val } : a)))
  }

  const handleAnomalyNameSelect = (idx: number, val: string) => {
    if (val === '__add_new__') {
      setAnomalyNameFree((prev) => ({ ...prev, [idx]: true }))
      updateAnomaly(idx, 'name', '')
    } else {
      setAnomalyNameFree((prev) => ({ ...prev, [idx]: false }))
      updateAnomaly(idx, 'name', val)
    }
  }

  const varNameKeys = Object.keys(uniqueNames.variables)

  return (
    <div>
      {/* ---- Title ---- */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Experiment Title *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Ferm 130-BO"
          className={inputClass}
        />
      </div>

      {/* ---- Date ---- */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Experiment Date
        </label>
        <input
          type="date"
          value={experimentDate}
          onChange={(e) => onExperimentDateChange(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* ---- Variables ---- */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="block text-sm font-medium text-gray-700">Variables</span>
          <button
            type="button"
            onClick={addVariable}
            className="text-xs font-medium"
            style={{ color: '#eb5234' }}
          >
            + Add Variable
          </button>
        </div>

        {variables.map((variable, idx) => {
          const isNameFree = !!varNameFree[idx]
          const isValueFree = !!varValueFree[idx]
          const valueOptions = variable.name ? (uniqueNames.variables[variable.name] ?? []) : []

          return (
            <div key={idx} className="flex items-center gap-2 mb-1.5">
              {/* Name */}
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
                    className={selectClass}
                  >
                    <option value="">Select name…</option>
                    {varNameKeys.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                    <option value="__add_new__">Add new…</option>
                  </select>
                )}
              </div>

              {/* Value */}
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
                    className={selectClass}
                    disabled={!variable.name && !isNameFree}
                  >
                    <option value="">Select value…</option>
                    {valueOptions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    <option value="__add_new__">Add new…</option>
                  </select>
                )}
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeVariable(idx)}
                className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
                style={{ width: 28, height: 28 }}
                aria-label="Remove variable"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* ---- Events ---- */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="block text-sm font-medium text-gray-700">Events</span>
          <button
            type="button"
            onClick={addEvent}
            className="text-xs font-medium"
            style={{ color: '#eb5234' }}
          >
            + Add Event
          </button>
        </div>

        {events.map((event, idx) => {
          const isNameFree = !!eventNameFree[idx]

          return (
            <div key={idx} className="flex items-center gap-2 mb-1.5">
              {/* Name */}
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
                    className={selectClass}
                  >
                    <option value="">Select event…</option>
                    {uniqueNames.events.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value="__add_new__">Add new…</option>
                  </select>
                )}
              </div>

              {/* Timepoint */}
              <div className="flex-1">
                <input
                  type="text"
                  value={event.timepoint}
                  onChange={(e) => updateEvent(idx, 'timepoint', e.target.value)}
                  placeholder="Timepoint (h)"
                  className={inputClass}
                />
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeEvent(idx)}
                className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
                style={{ width: 28, height: 28 }}
                aria-label="Remove event"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* ---- Anomalies ---- */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="block text-sm font-medium text-gray-700">Anomalies</span>
          <button
            type="button"
            onClick={addAnomaly}
            className="text-xs font-medium"
            style={{ color: '#eb5234' }}
          >
            + Add Anomaly
          </button>
        </div>

        {anomalies.map((anomaly, idx) => {
          const isNameFree = !!anomalyNameFree[idx]

          return (
            <div key={idx} className="flex items-center gap-2 mb-1.5">
              {/* Name */}
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
                    className={selectClass}
                  >
                    <option value="">Select anomaly…</option>
                    {uniqueNames.anomalies.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value="__add_new__">Add new…</option>
                  </select>
                )}
              </div>

              {/* Timepoint */}
              <div className="w-28">
                <input
                  type="text"
                  value={anomaly.timepoint}
                  onChange={(e) => updateAnomaly(idx, 'timepoint', e.target.value)}
                  placeholder="Timepoint (h)"
                  className={inputClass}
                />
              </div>

              {/* Description */}
              <div className="flex-1">
                <input
                  type="text"
                  value={anomaly.description}
                  onChange={(e) => updateAnomaly(idx, 'description', e.target.value)}
                  placeholder="Description"
                  className={inputClass}
                />
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeAnomaly(idx)}
                className="text-gray-400 hover:text-gray-600 flex items-center justify-center flex-shrink-0"
                style={{ width: 28, height: 28 }}
                aria-label="Remove anomaly"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* ---- Experiment Summary ---- */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Experiment Summary
        </label>
        <textarea
          rows={3}
          value={experimentSummary}
          onChange={(e) => onExperimentSummaryChange(e.target.value)}
          placeholder="Brief summary of the experiment's purpose, goals, or hypothesis..."
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
        />
      </div>

      {/* ---- Experiment Notes ---- */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Experiment Notes
        </label>
        <textarea
          rows={4}
          value={experimentNote}
          onChange={(e) => onExperimentNoteChange(e.target.value)}
          placeholder="Add experiment notes, observations, or procedures..."
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-y"
        />

        {/* Attachments */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-gray-700">Attachments</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-medium"
              style={{ color: '#eb5234' }}
            >
              + Add Image
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) {
                onNoteImagesChange([...noteImages, ...files])
              }
              // Reset so same file can be re-selected if removed then re-added
              e.target.value = ''
            }}
          />
          {previewUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {previewUrls.map((url, idx) => (
                <div key={url} className="relative group">
                  <img
                    src={url}
                    alt={`Attachment ${idx + 1}`}
                    className="w-20 h-20 rounded-lg object-cover border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = noteImages.filter((_, i) => i !== idx)
                      onNoteImagesChange(updated)
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Step1Details
