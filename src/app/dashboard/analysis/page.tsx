'use client'

import { CohortRail } from '@/components/dashboard/analysis/CohortRail'

export default function AnalysisPage() {
  return (
    <div className="flex h-[calc(100vh-64px)]">
      <aside className="w-[280px] shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
        <CohortRail />
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="p-6">
          <div className="text-sm text-gray-500">Theme tabs go here (Task 21).</div>
          <div className="mt-6 rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Pick experiments on the left to begin an analysis.
          </div>
        </div>
      </main>
    </div>
  )
}
