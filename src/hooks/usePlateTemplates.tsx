'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

export type PlateTemplate = {
  id: number
  name: string
  project: number
  template_type: 'plate'
  plate_config: {
    variable_names: string[]
    measurement_data_category_ids: number[]
    default_format: '96' | '384'
  }
  created_at: string
  updated_at: string
}

export function usePlateTemplates(projectId: number | null | undefined) {
  const { getToken } = useAuth()
  const [templates, setTemplates] = useState<PlateTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!projectId) { setTemplates([]); return }
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const resp = await fetch(
        `${API}/api/data-templates/?type=plate&project_id=${projectId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setTemplates(await resp.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projectId, getToken])

  useEffect(() => { refetch() }, [refetch])

  return { templates, loading, error, refetch }
}
