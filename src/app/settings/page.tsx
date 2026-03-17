'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOrganization, useAuth, useUser } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'

interface BackendUser {
  first_name: string
  last_name: string
  email: string
}

interface OrgMember {
  userId: string | undefined
  identifier: string | undefined
  firstName: string | undefined
  lastName: string | undefined
  role: string
}

type InviteRole = 'org:member' | 'org:admin'

export default function Settings() {
  const { organization, isLoaded: isOrgLoaded, membership } = useOrganization()
  const { user: clerkUser } = useUser()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('org:member')
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null)
  const { projects, activeProject, setActiveProjectId, refreshProjects } = useProjectContext()
  const { getToken } = useAuth()
  const [members, setMembers] = useState<OrgMember[]>([])
  const [removeStatus, setRemoveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; identifier: string } | null>(null)
  const router = useRouter()

  const isAdmin = membership?.role === 'org:admin'

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
  }, [])


  useEffect(() => {
    if (!isOrgLoaded || !organization || !isAdmin) return
    const fetchMembers = async () => {
      try {
        const result = await organization.getMemberships()
        setMembers(
          (result.data || []).map((m) => ({
            userId: m.publicUserData?.userId ?? undefined,
            identifier: m.publicUserData?.identifier ?? undefined,
            firstName: m.publicUserData?.firstName ?? undefined,
            lastName: m.publicUserData?.lastName ?? undefined,
            role: m.role,
          }))
        )
      } catch {
        // silently fail
      }
    }
    fetchMembers()
  }, [isOrgLoaded, organization, isAdmin])

  const handleRemove = async (clerkUserId: string, identifier: string) => {
    setIsRemoving(clerkUserId)
    setConfirmRemove(null)
    setRemoveStatus(null)

    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/remove-member/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clerk_user_id: clerkUserId }),
      })

      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== clerkUserId))
        setRemoveStatus({ type: 'success', message: `${identifier} has been removed` })
      } else {
        const data = await res.json()
        setRemoveStatus({ type: 'error', message: data.error || 'Failed to remove member' })
      }
    } catch {
      setRemoveStatus({ type: 'error', message: 'Failed to connect to server' })
    } finally {
      setIsRemoving(null)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organization || !inviteEmail.trim()) return

    setIsSending(true)
    setInviteStatus(null)

    try {
      // Check if email is already in the organization
      const members = await organization.getMemberships()
      const alreadyMember = members.data?.some(
        (m) => m.publicUserData?.identifier?.toLowerCase() === inviteEmail.trim().toLowerCase()
      )
      if (alreadyMember) {
        setInviteStatus({ type: 'error', message: `${inviteEmail} is already a member of this organization` })
        setIsSending(false)
        return
      }

      await organization.inviteMember({
        emailAddress: inviteEmail.trim(),
        role: inviteRole,
      })
      setInviteStatus({ type: 'success', message: `Invitation sent to ${inviteEmail}` })
      setInviteEmail('')
      setInviteRole('org:member')
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerkErr = err as any
      const message = clerkErr?.errors?.[0]?.longMessage
        || clerkErr?.errors?.[0]?.message
        || (err instanceof Error ? err.message : 'Failed to send invitation')
      setInviteStatus({ type: 'error', message })
    } finally {
      setIsSending(false)
    }
  }

  if (!backendUser) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-semibold mb-6">Settings</h2>
        <div className="max-w-md space-y-4">
          <div className="animate-pulse bg-gray-200 rounded h-10" />
          <div className="animate-pulse bg-gray-200 rounded h-10" />
          <div className="animate-pulse bg-gray-200 rounded h-10" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-6">Settings</h2>
      <div className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
          <input
            type="text"
            value={backendUser?.first_name ?? ''}
            readOnly
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
          <input
            type="text"
            value={backendUser?.last_name ?? ''}
            readOnly
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={backendUser?.email ?? ''}
            readOnly
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        </div>
      </div>

      <h3 className="text-xl font-semibold mt-8 mb-4">Organization</h3>
      <div className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
          <input
            type="text"
            value={isOrgLoaded ? (organization?.name ?? '') : ''}
            readOnly
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Project</label>
          <div className="flex gap-2">
            <select
              value={activeProject?.id ?? ''}
              onChange={(e) => setActiveProjectId(Number(e.target.value))}
              className="flex-1 border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {projects.length === 0 ? (
                <option value="">No projects</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))
              )}
            </select>
            {isAdmin && (
              <button
                onClick={() => router.push('/settings/new-project')}
                className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors hover:opacity-90"
                style={{ backgroundColor: '#eb5234' }}
              >
                Create New
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <>
            <h4 className="text-lg font-medium mt-4">Invite Member</h4>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  className="w-full border-white rounded-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as InviteRole)}
                  className="w-full border-white rounded-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="org:member">Member</option>
                  <option value="org:admin">Admin</option>
                </select>
              </div>
              {inviteStatus && (
                <p className={`text-sm p-2 rounded ${
                  inviteStatus.type === 'success'
                    ? 'text-green-600 bg-green-50'
                    : 'text-red-600 bg-red-50'
                }`}>
                  {inviteStatus.message}
                </p>
              )}
              <button
                type="submit"
                disabled={isSending || !inviteEmail.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#eb5234' }}
              >
                {isSending ? 'Sending...' : 'Send Invitation'}
              </button>
            </form>

            <h4 className="text-lg font-medium mt-8">Remove Member</h4>
            {removeStatus && (
              <p className={`text-sm p-2 rounded ${
                removeStatus.type === 'success'
                  ? 'text-green-600 bg-green-50'
                  : 'text-red-600 bg-red-50'
              }`}>
                {removeStatus.message}
              </p>
            )}
            <div className="space-y-2">
              {members.filter((m) => m.userId !== clerkUser?.id).length === 0 ? (
                <p className="text-sm text-gray-500">No other members</p>
              ) : (
                members
                  .filter((m) => m.userId !== clerkUser?.id)
                  .map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {m.firstName} {m.lastName}
                        </p>
                        <p className="text-xs text-gray-500">{m.identifier} &middot; {m.role.replace('org:', '')}</p>
                      </div>
                      <button
                        onClick={() => m.userId && setConfirmRemove({ userId: m.userId, identifier: m.identifier || m.userId })}
                        disabled={isRemoving === m.userId}
                        className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
                      >
                        {isRemoving === m.userId ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  ))
              )}
            </div>
          </>
        )}
      </div>

      {confirmRemove && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setConfirmRemove(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Remove Member</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to remove <span className="font-medium">{confirmRemove.identifier}</span> from
                this organization? This will delete their account data and cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmRemove(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRemove(confirmRemove.userId, confirmRemove.identifier)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
