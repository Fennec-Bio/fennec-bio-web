export function normalizeVariableColumnName(columnName: string): string {
  return columnName.trim().toLowerCase()
}

export function hasVariableColumn(
  columns: readonly string[],
  columnName: string,
): boolean {
  const normalizedColumnName = normalizeVariableColumnName(columnName)

  return columns.some(
    (column) => normalizeVariableColumnName(column) === normalizedColumnName,
  )
}

export function appendVariableColumnIfMissing(
  variableNames: string[],
  columnName: string,
): string[] {
  if (hasVariableColumn(variableNames, columnName)) {
    return variableNames
  }

  return [...variableNames, columnName]
}

export function insertVariableColumnAfterIfMissing(
  variableNames: string[],
  columnName: string,
  afterColumnName: string,
): string[] {
  if (hasVariableColumn(variableNames, columnName)) {
    return variableNames
  }

  const normalizedAfterColumnName = normalizeVariableColumnName(afterColumnName)
  const afterIndex = variableNames.findIndex(
    (name) => normalizeVariableColumnName(name) === normalizedAfterColumnName,
  )

  if (afterIndex < 0) {
    return [...variableNames, columnName]
  }

  return [
    ...variableNames.slice(0, afterIndex + 1),
    columnName,
    ...variableNames.slice(afterIndex + 1),
  ]
}
