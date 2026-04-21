'use client'

import { useProjectContext } from '@/hooks/useProjectContext'

export function PlateStep1Details({
  title, onTitleChange,
  description, onDescriptionChange,
  date, onDateChange,
  onNext, onCancel,
}: {
  title: string
  onTitleChange: (v: string) => void
  description: string
  onDescriptionChange: (v: string) => void
  date: string
  onDateChange: (v: string) => void
  onNext: () => void
  onCancel?: () => void
}) {
  const { activeProject } = useProjectContext()
  const projectId = activeProject?.id ?? null
  const canAdvance = title.trim().length > 0 && projectId !== null

  return (
    <div className="space-y-4">
      {!projectId && (
        <div className="rounded bg-red-50 p-2 text-sm text-red-600">
          Select a project in the sidebar before creating a plate experiment.
        </div>
      )}
      <div>
        <label htmlFor="plate-wizard-title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          id="plate-wizard-title"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
        />
      </div>
      <div>
        <label htmlFor="plate-wizard-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          id="plate-wizard-description"
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
        />
      </div>
      <div>
        <label htmlFor="plate-wizard-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
        <input
          id="plate-wizard-date"
          type="date"
          value={date}
          onChange={e => onDateChange(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50 disabled:pointer-events-none"
        >
          Next
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
