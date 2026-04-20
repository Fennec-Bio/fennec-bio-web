'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { MediaComponentCatalog, emptyCatalog } from './MediaFormShared'

export function useMediaComponentCatalog(refreshKey?: number): MediaComponentCatalog {
  const { getToken } = useAuth()
  const [catalog, setCatalog] = useState<MediaComponentCatalog>(emptyCatalog)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/media/components/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data: MediaComponentCatalog = await res.json()
        if (!cancelled) setCatalog(data)
      } catch {
        // Non-critical — dropdown just stays empty
      }
    }
    load()
    return () => { cancelled = true }
  }, [getToken, refreshKey])

  return catalog
}
