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
  setActiveProjectId: (id: number) => void
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
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
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
        if (data.length > 0 && !activeProjectId) {
          setActiveProjectId(data[0].id)
        }
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
