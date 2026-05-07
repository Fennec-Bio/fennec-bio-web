export type VariableSuggestionMap = Record<string, string[] | undefined>

export function normalizeVariableName(name: string): string {
  return name.trim().toLowerCase()
}

export function getSuggestionsForVariable(
  variableName: string,
  suggestionsByVariable: VariableSuggestionMap,
): string[] {
  return suggestionsByVariable[normalizeVariableName(variableName)] ?? []
}

export function filterSuggestions(query: string, suggestions: string[]): string[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return suggestions
  return suggestions.filter(s => s.toLowerCase().includes(normalizedQuery))
}
