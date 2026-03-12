'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'

export default function AuthSync() {
  const { isSignedIn, getToken } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isSignedIn) return

    const check = async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/check-account/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.has_account) {
            router.replace('/dashboard')
          } else {
            router.replace('/complete-signup')
          }
          return
        }
      } catch (err) {
        console.error('Account check failed:', err)
      }
      // Fallback: send to complete-signup if check fails
      router.replace('/complete-signup')
    }

    check()
  }, [isSignedIn, getToken, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto mb-4" />
        <p className="text-gray-600">Checking your account...</p>
      </div>
    </div>
  )
}
