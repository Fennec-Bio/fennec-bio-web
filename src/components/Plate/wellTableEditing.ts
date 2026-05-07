export type EditableColumn =
  | { kind: 'variable'; key: string }
  | { kind: 'measurement'; key: number }

export type CellAddress = {
  columnIndex: number
  wellIndex: number
}

export type FillDragState = {
  source: CellAddress
  targetWellIndex: number
}

export type WellTableGrids = {
  variableGrids: Record<string, Record<string, string>>
  measurementGrids: Record<number, Record<string, string>>
}

export function parsePastedBlock(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.map(l => l.split('\t'))
}

export function applyCellBlock(
  grids: WellTableGrids,
  editableColumns: EditableColumn[],
  wellKeys: string[],
  start: CellAddress,
  rows: string[][],
): WellTableGrids {
  const variableGrids = { ...grids.variableGrids }
  const measurementGrids = { ...grids.measurementGrids }

  for (let rowOffset = 0; rowOffset < rows.length; rowOffset++) {
    const wellKey = wellKeys[start.wellIndex + rowOffset]
    if (!wellKey) continue

    const row = rows[rowOffset]
    for (let colOffset = 0; colOffset < row.length; colOffset++) {
      const column = editableColumns[start.columnIndex + colOffset]
      if (!column) continue

      const value = row[colOffset].trim()
      if (column.kind === 'variable') {
        const currentColumn = variableGrids[column.key]
        const nextColumn = { ...(currentColumn || {}) }
        if (value === '') delete nextColumn[wellKey]
        else nextColumn[wellKey] = value
        variableGrids[column.key] = nextColumn
      } else {
        const currentColumn = measurementGrids[column.key]
        const nextColumn = { ...(currentColumn || {}) }
        if (value === '') delete nextColumn[wellKey]
        else nextColumn[wellKey] = value
        measurementGrids[column.key] = nextColumn
      }
    }
  }

  return { variableGrids, measurementGrids }
}

export function buildFillRows(value: string, sourceWellIndex: number, targetWellIndex: number) {
  const min = Math.min(sourceWellIndex, targetWellIndex)
  const max = Math.max(sourceWellIndex, targetWellIndex)
  return {
    startWellIndex: min,
    rows: Array.from({ length: max - min + 1 }, () => [value]),
  }
}
