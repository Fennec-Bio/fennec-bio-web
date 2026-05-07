import type { ClassifiedData } from './Step2Upload'

export interface PumpSeriesOption {
  name: string
  unit: string
  pointCount: number
}

interface ProcessRowLike {
  name: string
  unit?: string
}

export interface FermentationMetadataState {
  batchVolumeMl: string
  feedPumpSeries: string
  wastePumpSeries: string
}

export interface FermentationMetadataPayload {
  batch_volume_ml: number | null
  feed_pump_series: string
  waste_pump_series: string
}

export function buildPumpSeriesOptions(classifiedData: ClassifiedData): PumpSeriesOption[] {
  const byName = new Map<string, PumpSeriesOption>()
  for (const series of classifiedData.process_data) {
    const name = series.name.trim()
    if (!name || byName.has(name)) continue
    byName.set(name, {
      name,
      unit: series.unit,
      pointCount: series.data.length,
    })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function buildPumpSeriesOptionsFromProcessRows(rows: ProcessRowLike[]): PumpSeriesOption[] {
  const byName = new Map<string, PumpSeriesOption>()
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    const current = byName.get(name)
    if (current) {
      current.pointCount += 1
    } else {
      byName.set(name, {
        name,
        unit: row.unit ?? '',
        pointCount: 1,
      })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function buildFermentationMetadataPayload(
  state: FermentationMetadataState,
): FermentationMetadataPayload {
  const batchVolume = state.batchVolumeMl.trim() === ''
    ? null
    : Number(state.batchVolumeMl)
  return {
    batch_volume_ml: batchVolume !== null && Number.isFinite(batchVolume) ? batchVolume : null,
    feed_pump_series: state.feedPumpSeries.trim(),
    waste_pump_series: state.wastePumpSeries.trim(),
  }
}
