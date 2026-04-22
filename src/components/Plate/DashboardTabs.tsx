'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type DashboardSection = 'reactor' | 'plates'

interface DashboardTabsProps {
  value?: DashboardSection
  onChange?: (value: DashboardSection) => void
}

export function DashboardTabs({ value, onChange }: DashboardTabsProps = {}) {
  const pathname = usePathname()
  const controlled = value !== undefined && onChange !== undefined
  const currentSection: DashboardSection = controlled
    ? value
    : pathname?.startsWith('/dashboard/plates')
      ? 'plates'
      : 'reactor'

  const currentLabel = currentSection === 'plates' ? 'Plates' : 'Reactor'
  const otherSection: DashboardSection = currentSection === 'plates' ? 'reactor' : 'plates'
  const otherLabel = otherSection === 'plates' ? 'Plates' : 'Reactor'
  const otherHref = otherSection === 'plates' ? '/dashboard/plates' : '/dashboard'

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = () => {
    setOpen(false)
    if (controlled) onChange!(otherSection)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="h-8 px-3 border border-gray-200 rounded-md text-xs font-medium shadow-xs hover:bg-gray-100 transition-all flex items-center gap-1"
      >
        {currentLabel}
        <ChevronDown className="h-3 w-3 text-gray-500" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] min-w-[140px]">
          {controlled ? (
            <button
              type="button"
              onClick={handleSelect}
              className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
            >
              {otherLabel}
            </button>
          ) : (
            <Link
              href={otherHref}
              className="block px-4 py-2 hover:bg-gray-100 text-sm cursor-pointer"
              onClick={() => setOpen(false)}
            >
              {otherLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
