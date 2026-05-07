export type ReplicateVariable = {
  name: string
  value: string
}

export type ReplicateWell = {
  row: string
  column: number
  variables: ReplicateVariable[]
}

export function conditionKey(well: ReplicateWell): string {
  return well.variables
    .map((variable) => `${variable.name}=${variable.value}`)
    .sort()
    .join('|')
}

export function variableValue(
  well: ReplicateWell,
  variableName: string
): string | undefined {
  const normalizedName = variableName.trim().toLowerCase()
  const variable = well.variables.find(
    (candidate) => candidate.name.trim().toLowerCase() === normalizedName
  )

  return variable?.value.trim()
}

export function strainIsolateLabel(well: ReplicateWell): string | undefined {
  const strain = variableValue(well, 'Strain')

  if (!strain) {
    return undefined
  }

  const isolate = variableValue(well, 'Isolate')
  return isolate ? `${strain}-${isolate}` : strain
}

export function wellCoordinate(well: ReplicateWell): string {
  return `${well.row.trim()}${well.column}`
}

export function groupedWellLabel(well: ReplicateWell): string {
  return strainIsolateLabel(well) ?? wellCoordinate(well)
}
