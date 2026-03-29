'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useProjectContext } from '@/hooks/useProjectContext'

interface NavbarProps {
  onMenuToggle?: () => void
  isMenuOpen?: boolean
}

export const Navbar = ({ onMenuToggle, isMenuOpen }: NavbarProps) => {
  const [navDropdownOpen, setNavDropdownOpen] = useState(false)
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)
  const pathname = usePathname()
  const { isSignedIn } = useAuth()
  const { signOut } = useClerk()
  const { projects, activeProject, setActiveProjectId } = useProjectContext()

  // Don't show navbar on public pages
  const isPublicPage = pathname.startsWith('/sign-up') || pathname === '/no-org' || pathname === '/auth-sync'
  if (isPublicPage) return null

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/experiments', label: 'Experiments' },
    { href: '/notebook', label: 'Notebook' },
    { href: '/strains', label: 'Strains' },
    { href: '/literature', label: 'Literature' },
    { href: '/settings', label: 'Settings' },
  ]

  const currentPage = navItems.find(item => item.href === pathname)?.label || 'Dashboard'

  return (
    <div className='text-white p-4 relative z-[60]' style={{ backgroundColor: '#eb5234' }}>
      {/* Hamburger menu button - mobile only */}
      <button
        className="md:hidden absolute left-4 top-1/2 -translate-y-1/2 p-2"
        onClick={onMenuToggle}
        aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
      >
        {isMenuOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      <h1 className="text-center">Fennec Bio Data Analysis Tool</h1>

      {/* Right-side items */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-3">
        {/* Project dropdown */}
        {isSignedIn && (
          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <span className="text-sm font-medium truncate max-w-[120px]">
                {activeProject?.name ?? 'Select Project'}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 transition-transform ${projectDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {projectDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProjectDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg z-50 overflow-hidden">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => {
                        setActiveProjectId(project.id)
                        setProjectDropdownOpen(false)
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                        activeProject?.id === project.id
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Navigation dropdown - only when signed in */}
        {isSignedIn && (
          <div className="relative">
            <button
              onClick={() => setNavDropdownOpen(!navDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <span className="text-sm font-medium">{currentPage}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 transition-transform ${navDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {navDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setNavDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-lg z-50 overflow-hidden">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setNavDropdownOpen(false)}
                      className={`block px-4 py-2 text-sm transition-colors ${
                        pathname === item.href
                          ? 'bg-gray-100 text-gray-900 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Auth button */}
        {isSignedIn ? (
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            className="px-3 py-1.5 text-sm font-medium bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            Logout
          </button>
        ) : (
          <Link
            href="/sign-in"
            className="px-3 py-1.5 text-sm font-medium bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            Login
          </Link>
        )}
      </div>
    </div>
  )
}

export default Navbar
