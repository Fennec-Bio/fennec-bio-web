'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'

export type DataCategory = {
  id: number
  category: 'product' | 'secondary_product' | 'process_data'
  name: string
  unit: string
  data_type: 'discrete' | 'continuous' | 'point'
}

export function useDataCategories(projectId: number | null | undefined) {
  const { getToken } = useAuth()
  const [categories, setCategories] = useState<DataCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!projectId) { setCategories([]); return }
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/data-categories/?project_id=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setCategories(await resp.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projectId, getToken])

  useEffect(() => { refetch() }, [refetch])

  return { categories, loading, error, refetch }
}
