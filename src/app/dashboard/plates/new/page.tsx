'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'
import { DashboardTabs } from '@/components/Plate/DashboardTabs'

export default function NewPlateExperimentPage() {
  const router = useRouter()
  const { getToken } = useAuth()
  const { activeProject } = useProjectContext()
  const projectId = activeProject?.id ?? null

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId || !title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await getToken()
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/plate-experiments/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          project: projectId,
          description,
          date: date || null,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const exp = await resp.json()
      router.push(`/dashboard/plates/${exp.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        <DashboardTabs />
        <div className="mx-auto max-w-2xl bg-white rounded-lg shadow p-6">
          <h1 className="mb-4 text-xl md:text-2xl font-bold text-gray-900">New plate experiment</h1>
          {!projectId && (
            <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">
              Select a project in the sidebar before creating a plate experiment.
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
              />
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
              />
            </div>
            {error && <div className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !title.trim() || !projectId}
                className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50 disabled:pointer-events-none"
              >
                {submitting ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
