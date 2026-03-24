'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'

export default function NewProject() {
  const [name, setName] = useState('')
  const [chassis, setChassis] = useState('')
  const [customChassis, setCustomChassis] = useState('')
  const [productType, setProductType] = useState('')
  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { getToken } = useAuth()
  const { refreshProjects } = useProjectContext()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    setError('')

    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/create/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          chassis: chassis === 'other' ? customChassis.trim() : chassis,
          product_type: productType,
          ...(productType === 'small_molecule' || productType === 'protein' ? { product_name: productName.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      })

      if (res.ok) {
        await refreshProjects()
        router.push('/settings')
      } else {
        const data = await res.json()
        setError(data.error || data.name?.[0] || 'Failed to create project')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-6">Create New Project</h2>
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
            required
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chassis</label>
          <select
            value={chassis}
            onChange={(e) => {
              setChassis(e.target.value)
              if (e.target.value !== 'other') setCustomChassis('')
            }}
            required
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a chassis</option>
            <option value="S. cerevisiae">S. cerevisiae</option>
            <option value="E. coli">E. coli</option>
            <option value="Pichia pastoris">Pichia pastoris</option>
            <option value="other">Other</option>
          </select>
          {chassis === 'other' && (
            <input
              type="text"
              value={customChassis}
              onChange={(e) => setCustomChassis(e.target.value)}
              placeholder="Enter chassis organism"
              required
              className="w-full border-white rounded-md px-3 py-2 bg-gray-50 mt-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
          <select
            value={productType}
            onChange={(e) => {
              setProductType(e.target.value)
              if (e.target.value === 'biomass') setProductName('')
            }}
            required
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a product type</option>
            <option value="small_molecule">Small Molecule</option>
            <option value="protein">Protein</option>
            <option value="biomass">Biomass</option>
          </select>
        </div>
        {(productType === 'small_molecule' || productType === 'protein') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Cannabidiol, Insulin"
              required
              className="w-full border-white rounded-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the goals, scope, or notes for this project..."
            rows={4}
            className="w-full border-white rounded-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || !chassis || (chassis === 'other' && !customChassis.trim()) || !productType || ((productType === 'small_molecule' || productType === 'protein') && !productName.trim())}
            className="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#eb5234' }}
          >
            {isSubmitting ? 'Creating...' : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
