'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

/**
 * Calls GET /api/me/ once per session to ensure the authenticated user
 * exists in the Django backend with email and org memberships.
 */
export function useBackendSync() {
  const { isSignedIn, getToken } = useAuth()
  const hasSynced = useRef(false)

  useEffect(() => {
    if (!isSignedIn || hasSynced.current) return
    hasSynced.current = true

    const sync = async () => {
      try {
        const token = await getToken()
        await fetch('http://localhost:8000/api/me/', {
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {
        // silently fail — will retry next page load
      }
    }
    sync()
  }, [isSignedIn, getToken])
}
