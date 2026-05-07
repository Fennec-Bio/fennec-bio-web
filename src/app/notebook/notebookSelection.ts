export interface NotebookExperimentLookup {
  id: number
  title: string
}

export function resolveNotebookExperimentTarget<T extends NotebookExperimentLookup>(
  experiments: T[],
  query: { title: string | null; id: string | null },
): T | NotebookExperimentLookup | null {
  const parsedId = query.id == null ? null : Number(query.id)
  const hasValidId = parsedId !== null && Number.isFinite(parsedId)

  if (hasValidId) {
    const byId = experiments.find(e => e.id === parsedId)
    if (byId) return byId
    if (query.title) return { id: parsedId, title: query.title }
  }

  if (!query.title) return null
  return experiments.find(e => e.title === query.title) ?? null
}
