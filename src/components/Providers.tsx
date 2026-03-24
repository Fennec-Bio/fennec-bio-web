'use client'

import { ProjectProvider } from '@/hooks/useProjectContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return <ProjectProvider>{children}</ProjectProvider>
}
