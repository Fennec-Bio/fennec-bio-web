'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

export type PlateExperimentListItem = {
  id: string
  title: string
  description: string
  date: string | null
  project: number
  project_name: string
  plate_count: number
  created_at: string
  updated_at: string
}

export type ListResponse = {
  results: PlateExperimentListItem[]
  count: number
  page: number
  num_pages: number
  unique_variable_names: string[]
  unique_measurement_names: string[]
}

export type WellVariable = { id: number; name: string; value: string }
export type WellDataPoint = {
  id: number
  data_category: number
  data_category_name: string
  data_category_category: string
  unit: string
  value: number
}
export type Well = {
  id: number
  row: string
  column: number
  variables: WellVariable[]
  data_points: WellDataPoint[]
}
export type Plate = {
  id: number
  label: string
  format: '96' | '384'
  position: number
  wells: Well[]
}
export type PlateExperimentDetail = {
  id: string
  title: string
  description: string
  experiment_note: string
  date: string | null
  project: number
  project_name: string
  plates: Plate[]
  created_at: string
  updated_at: string
}

export type PlateFiltersParam = {
  variables?: { name: string; value: string }[]
  strain?: string
  media?: { id: number; name: string }
  keyword?: string
}

export type PlateSortParam = { by: string; order: 'asc' | 'desc' }

export function usePlateExperiments(params: {
  projectId?: number | null
  filters?: PlateFiltersParam
  sort?: PlateSortParam
  page?: number
  pageSize?: number
}) {
  const { getToken } = useAuth()
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stringify filter/sort to give useCallback a stable dependency. The objects
  // passed in are recreated on every parent render, but their JSON identity is
  // what actually drives a refetch.
  const filtersKey = JSON.stringify(params.filters ?? {})
  const sortKey = JSON.stringify(params.sort ?? null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const qs = new URLSearchParams()
      if (params.projectId) qs.set('project', String(params.projectId))
      if (params.page) qs.set('page', String(params.page))
      if (params.pageSize) qs.set('page_size', String(params.pageSize))

      const f = params.filters
      if (f?.variables && f.variables.length > 0) {
        qs.set('variables', f.variables.map(v => `${v.name}:${v.value}`).join(','))
      }
      if (f?.strain) qs.set('strain', f.strain)
      if (f?.media) qs.set('media_id', String(f.media.id))
      if (f?.keyword) qs.set('keyword', f.keyword)

      if (params.sort) {
        qs.set('sort_by', params.sort.by)
        qs.set('sort_order', params.sort.order)
      }

      const resp = await fetch(`${API}/api/plate-experiments/?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setData(await resp.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, params.projectId, params.page, params.pageSize, filtersKey, sortKey])

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
}

export function usePlateExperiment(id: string) {
  const { getToken } = useAuth()
  const [data, setData] = useState<PlateExperimentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const resp = await fetch(`${API}/api/plate-experiments/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setData(await resp.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id, getToken])

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
}
