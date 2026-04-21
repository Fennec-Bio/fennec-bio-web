'use client'

export type PlateReviewSummary = {
  label: string
  format: '96' | '384'
  wellsWithDataCount: number
}

export function PlateStep3Review({
  title, date, plates,
  errorMessage, successMessage, isCreating,
  onBack, onCreate,
}: {
  title: string
  date: string
  plates: PlateReviewSummary[]
  errorMessage: string
  successMessage: string
  isCreating: boolean
  onBack: () => void
  onCreate: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
        <div>
          <div className="text-xs uppercase text-gray-500">Title</div>
          <div className="text-sm text-gray-900">{title || <span className="text-gray-400">(empty)</span>}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500">Date</div>
          <div className="text-sm text-gray-900">{date || <span className="text-gray-400">—</span>}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-gray-500 mb-1">Plates ({plates.length})</div>
          {plates.length === 0 ? (
            <div className="text-sm text-gray-400">None</div>
          ) : (
            <ul className="text-sm text-gray-900 space-y-0.5">
              {plates.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.label}</span> ({p.format}-well) — {p.wellsWithDataCount} well{p.wellsWithDataCount === 1 ? '' : 's'} with data
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded bg-red-50 p-2 text-sm text-red-600 whitespace-pre-wrap">{errorMessage}</div>
      )}
      {successMessage && (
        <div className="rounded bg-green-50 p-2 text-sm text-green-700">{successMessage}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isCreating}
          className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating || plates.length === 0 || !title.trim()}
          className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50 disabled:pointer-events-none"
        >
          {isCreating ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}
