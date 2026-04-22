'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function DashboardTabs() {
  const pathname = usePathname()
  const onPlates = pathname?.startsWith('/dashboard/plates')
  const onFerms = pathname === '/dashboard'

  const activeCls = 'px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium'
  const inactiveCls = 'px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50'

  return (
    <div className="mb-4 flex gap-2">
      <Link href="/dashboard" className={onFerms ? activeCls : inactiveCls}>
        Fermentations
      </Link>
      <Link href="/dashboard/plates" className={onPlates ? activeCls : inactiveCls}>
        Plates
      </Link>
    </div>
  )
}
