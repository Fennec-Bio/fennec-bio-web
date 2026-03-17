'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'

export default function AuthSync() {
  const { isSignedIn, getToken } = useAuth()
  const router = useRouter()
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!isSignedIn) return

    const check = async () => {
      try {
        const token = await getToken()
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/check-account/`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.ok) {
          const data = await res.json()
          router.replace(data.has_account ? '/dashboard' : '/complete-signup')
          return
        }
      } catch {
        // Auth check failed — fall through to error state
      }
      setError(true)
    }

    check()
  }, [isSignedIn, getToken, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-lg font-semibold text-gray-900 mb-2">
            We&apos;re having some problems
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Something went wrong while setting up your account. Please try again shortly.
          </p>
          <button
            onClick={() => {
              setError(false)
              window.location.reload()
            }}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto mb-4" />
        <p className="text-gray-600">Checking your account...</p>
      </div>
    </div>
  )
}
