'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MediaList } from '@/components/Shared/MediaList'
import { CreateMedia } from '@/components/media/CreateMedia'
import { EditMedia } from '@/components/media/EditMedia'

interface Media {
  id: number
  name: string
  project: number | null
  created_at: string
  updated_at: string
}

export default function MediaPage() {
  const [selectedMediaId, setSelectedMediaId] = useState<number | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(true)
  const [isEditOpen, setIsEditOpen] = useState(true)
  const [listRefreshKey, setListRefreshKey] = useState(0)

  const handleMediaSelect = useCallback((m: Media) => {
    setSelectedMediaId(m.id)
    setIsEditOpen(true)
    setIsMobileMenuOpen(false)
  }, [])

  return (
    <div className="bg-gray-50 min-h-screen">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[85%] max-w-[320px] bg-white overflow-y-auto shadow-xl">
            <MediaList onMediaSelect={handleMediaSelect} isMobileDrawer refreshKey={listRefreshKey} />
          </div>
        </div>
      )}

      <div className="max-w-[1920px] mx-auto px-3 py-3 md:px-4 md:py-4 lg:px-6">
        <button
          className="md:hidden mb-3 h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs hover:bg-gray-100 transition-all"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          Media
        </button>

        <div className="flex flex-row gap-3 md:gap-5 lg:gap-6">
          <div className="hidden md:block w-[364px] min-w-[364px] max-w-[416px] flex-shrink-0 relative z-30">
            <MediaList onMediaSelect={handleMediaSelect} refreshKey={listRefreshKey} />
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-3 md:gap-5">
            <div className="bg-white rounded-lg shadow">
              <button
                onClick={() => setIsCreateOpen(!isCreateOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xl md:text-2xl font-bold text-gray-900 hover:bg-gray-50 rounded-t-lg"
              >
                <span>Create Media</span>
                {isCreateOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
              </button>
              {isCreateOpen && (
                <div className="p-3 md:p-4 lg:p-6">
                  <CreateMedia
                    onCreated={() => setListRefreshKey((k) => k + 1)}
                    catalogRefreshKey={listRefreshKey}
                  />
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow">
              <button
                onClick={() => setIsEditOpen(!isEditOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xl md:text-2xl font-bold text-gray-900 hover:bg-gray-50 rounded-t-lg"
              >
                <span>Edit Media</span>
                {isEditOpen ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
              </button>
              {isEditOpen && (
                <div className="p-3 md:p-4 lg:p-6">
                  <EditMedia
                    selectedMediaId={selectedMediaId}
                    onUpdated={() => setListRefreshKey((k) => k + 1)}
                    catalogRefreshKey={listRefreshKey}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
