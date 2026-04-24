'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchCohortPayload } from '@/lib/analysis/api'
import type { CohortPayload } from '@/lib/analysis/types'

const cache = new Map<string, CohortPayload>()

function cacheKey(ids: number[], roleMapVersion: number | null): string {
  return `${[...ids].sort((a, b) => a - b).join(',')}|v${roleMapVersion ?? '0'}`
}

export function useCohortPayload(ids: number[]): {
  payload: CohortPayload | null
  loading: boolean
  error: string | null
} {
  const { getToken } = useAuth()
  const [payload, setPayload] = useState<CohortPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentFetchRef = useRef<number>(0)
  const idsKey = ids.join(',')

  useEffect(() => {
    if (ids.length === 0) {
      setPayload(null)
      setError(null)
      return
    }
    const key = cacheKey(ids, null)
    const cached = cache.get(key)
    if (cached) {
      setPayload(cached)
      setError(null)
      return
    }
    const requestId = ++currentFetchRef.current
    setLoading(true)
    ;(async () => {
      try {
        const token = await getToken()
        const body = await fetchCohortPayload(token, ids)
        if (requestId !== currentFetchRef.current) return
        cache.set(cacheKey(ids, body.role_map_version), body)
        setPayload(body)
        setError(null)
      } catch (e) {
        if (requestId !== currentFetchRef.current) return
        setError(String(e))
        setPayload(null)
      } finally {
        if (requestId === currentFetchRef.current) setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, getToken])

  return { payload, loading, error }
}
