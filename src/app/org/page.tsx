'use client'

import { useState, useEffect } from 'react'
import { useOrganization, useAuth, useClerk } from '@clerk/nextjs'

interface BackendUser {
  first_name: string
  last_name: string
  email: string
  is_platform_staff: boolean
}

interface OrgOption {
  id: number
  clerk_org_id: string
  name: string
}

export default function OrgSwitcherPage() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization()
  const { setActive } = useClerk()
  const { getToken } = useAuth()
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null)
  const [allOrgs, setAllOrgs] = useState<OrgOption[]>([])
  const [switchError, setSwitchError] = useState('')
  const [isSwitching, setIsSwitching] = useState<string | null>(null)

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          setBackendUser(await res.json())
        }
      } catch {
        // silently fail
      }
    }
    fetchMe()
  }, [getToken])

  useEffect(() => {
    if (!backendUser?.is_platform_staff) return
    const fetchOrgs = async () => {
      try {
        const token = await getToken()
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/organizations/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setAllOrgs(data.organizations || [])
        }
      } catch {
        // silently fail
      }
    }
    fetchOrgs()
  }, [backendUser?.is_platform_staff, getToken])

  const handleSwitchOrg = async (clerkOrgId: string) => {
    setIsSwitching(clerkOrgId)
    setSwitchError('')
    try {
      await setActive({ organization: clerkOrgId })
      window.location.reload()
    } catch {
      setSwitchError('You must be added as a member of this organization in Clerk first.')
      setIsSwitching(null)
    }
  }

  if (!backendUser) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-semibold mb-6">Switch Organization</h2>
        <div className="max-w-md space-y-4">
          <div className="animate-pulse bg-gray-200 rounded h-10" />
          <div className="animate-pulse bg-gray-200 rounded h-10" />
          <div className="animate-pulse bg-gray-200 rounded h-10" />
        </div>
      </div>
    )
  }

  if (!backendUser.is_platform_staff) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-semibold mb-6">Switch Organization</h2>
        <p className="text-sm text-gray-600">You do not have permission to switch organizations.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-6">Switch Organization</h2>
      <div className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Organization</label>
          <input
            type="text"
            value={isOrgLoaded ? (organization?.name ?? '') : ''}
            readOnly
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Switch Organization</label>
          {switchError && (
            <p className="text-sm p-2 rounded text-red-600 bg-red-50 mb-2">{switchError}</p>
          )}
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {allOrgs.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrg(org.clerk_org_id)}
                disabled={isSwitching !== null}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  organization?.id === org.clerk_org_id
                    ? 'bg-blue-100 border border-blue-300 font-medium'
                    : 'bg-gray-50 hover:bg-gray-100'
                } ${isSwitching !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {org.name}
                {isSwitching === org.clerk_org_id && ' (switching...)'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
