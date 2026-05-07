'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

type MediaOptionsResponse = {
  media: Array<{ id: number; name: string }>
}

export function useProjectMedia(projectId: number | null | undefined) {
  const { getToken } = useAuth()
  const [names, setNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!projectId) { setNames([]); return }
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const resp = await fetch(
        `${API}/api/media/options/?project_id=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as MediaOptionsResponse
      setNames(data.media.map(m => m.name))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projectId, getToken])

  useEffect(() => { refetch() }, [refetch])

  return { names, loading, error, refetch }
}
