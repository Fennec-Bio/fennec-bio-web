export function isCandidateResultPending(
  currentFiltersKey: string,
  loadedFiltersKey: string | null,
  loading: boolean,
): boolean {
  return loading || loadedFiltersKey !== currentFiltersKey
}
