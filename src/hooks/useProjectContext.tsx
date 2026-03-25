'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

interface Project {
  id: number
  name: string
  chassis: string
  product_type: string
  product_name: string
  description: string
}

interface ProjectContextValue {
  projects: Project[]
  activeProject: Project | null
  setActiveProjectId: (id: number | null) => void
  refreshProjects: () => Promise<void>
  isLoading: boolean
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  activeProject: null,
  setActiveProjectId: () => {},
  refreshProjects: async () => {},
  isLoading: true,
})

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectIdRaw] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = sessionStorage.getItem('activeProjectId')
    return stored ? Number(stored) : null
  })

  const setActiveProjectId = useCallback((id: number | null) => {
    setActiveProjectIdRaw(id)
    if (typeof window !== 'undefined') {
      if (id !== null) {
        sessionStorage.setItem('activeProjectId', String(id))
      } else {
        sessionStorage.removeItem('activeProjectId')
      }
    }
  }, [])
  const [isLoading, setIsLoading] = useState(true)
  const { getToken, isSignedIn } = useAuth()

  const refreshProjects = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [isSignedIn, getToken, activeProjectId])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  return (
    <ProjectContext.Provider
      value={{ projects, activeProject, setActiveProjectId, refreshProjects, isLoading }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjectContext() {
  return useContext(ProjectContext)
}
