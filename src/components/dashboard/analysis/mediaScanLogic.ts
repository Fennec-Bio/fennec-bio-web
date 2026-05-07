import type {
  CohortPayload,
  ExperimentInPayload,
  MediaComponent,
  OutcomeMetric,
} from '../../../lib/analysis/types'

export type MediaComponentSource = 'carbon' | 'nitrogen' | 'complex' | 'additional'

export type ScanAxis =
  | { kind: 'component_identity'; source: MediaComponentSource }
  | { kind: 'cn_ratio' }
  | {
      kind: 'component_concentration'
      componentName: string
      source: MediaComponentSource
    }

export type MediaScanPoint =
  | { x: string; y: number; isCategorical: true; id: number }
  | { x: number; y: number; isCategorical: false; id: number }

export interface MediaScanCatalog {
  identity: Record<MediaComponentSource, string[]>
  concentration: Record<MediaComponentSource, string[]>
}

const sourceKeys: Record<MediaComponentSource, keyof NonNullable<ExperimentInPayload['batch_media']>> = {
  carbon: 'carbon_sources',
  nitrogen: 'nitrogen_sources',
  complex: 'complex_components',
  additional: 'additional_components',
}

export const sourceLabels: Record<MediaComponentSource, string> = {
  carbon: 'Carbon source',
  nitrogen: 'Nitrogen source',
  complex: 'Complex component',
  additional: 'Additional component',
}

export function notebookUrlForExperimentTitle(title: string, id?: number): string {
  const experimentParam = `experiment=${encodeURIComponent(title)}`
  const idParam = id == null ? '' : `&id=${encodeURIComponent(String(id))}`
  return `/notebook?${experimentParam}${idParam}`
}

function outcomeValue(
  e: ExperimentInPayload,
  outcome: OutcomeMetric,
  product: string | null,
): number | null {
  if (outcome === 'biomass') return e.outcomes.biomass
  if (outcome === 'mu_max') return e.outcomes.mu_max
  if (outcome === 'substrate_rate') return e.outcomes.substrate_rate
  const dict = (e.outcomes as unknown as Record<string, Record<string, number | null>>)[outcome]
  return dict && product ? (dict[product] ?? null) : null
}

function batchComponents(
  e: ExperimentInPayload,
  source: MediaComponentSource,
): MediaComponent[] {
  const m = e.batch_media
  if (!m) return []
  return m[sourceKeys[source]] as MediaComponent[]
}

function componentIdentityOf(
  e: ExperimentInPayload,
  source: MediaComponentSource,
): string {
  const names = batchComponents(e, source).map(c => c.name).sort()
  return names.length > 0 ? names.join(', ') : 'No label'
}

function cnRatioOf(e: ExperimentInPayload): number | null {
  const m = e.batch_media
  if (!m) return null
  const c = m.carbon_sources.reduce((a, s) => a + (s.concentration ?? 0), 0)
  const n = m.nitrogen_sources.reduce((a, s) => a + (s.concentration ?? 0), 0)
  return n > 0 ? c / n : null
}

function componentConcOf(
  e: ExperimentInPayload,
  source: MediaComponentSource,
  name: string,
): number | null {
  const c = batchComponents(e, source).find(x => x.name === name)
  return c ? (c.concentration ?? null) : null
}

function emptySourceSets(): Record<MediaComponentSource, Set<string>> {
  return {
    carbon: new Set<string>(),
    nitrogen: new Set<string>(),
    complex: new Set<string>(),
    additional: new Set<string>(),
  }
}

function sortSourceSets(
  sets: Record<MediaComponentSource, Set<string>>,
): Record<MediaComponentSource, string[]> {
  return {
    carbon: [...sets.carbon].sort(),
    nitrogen: [...sets.nitrogen].sort(),
    complex: [...sets.complex].sort(),
    additional: [...sets.additional].sort(),
  }
}

export function buildMediaScanCatalog(payload: CohortPayload): MediaScanCatalog {
  const identity = emptySourceSets()
  const concentration = emptySourceSets()
  for (const e of payload.experiments) {
    for (const source of Object.keys(sourceKeys) as MediaComponentSource[]) {
      for (const component of batchComponents(e, source)) {
        identity[source].add(component.name)
        if (component.concentration != null) {
          concentration[source].add(component.name)
        }
      }
    }
  }
  return {
    identity: sortSourceSets(identity),
    concentration: sortSourceSets(concentration),
  }
}

export function buildMediaScanPointData(
  payload: CohortPayload,
  axis: ScanAxis,
  outcome: OutcomeMetric,
  product: string | null,
): MediaScanPoint[] {
  return payload.experiments.map(e => {
    const v = outcomeValue(e, outcome, product)
    if (v === null) return null
    if (axis.kind === 'component_identity') {
      return {
        x: componentIdentityOf(e, axis.source),
        y: v,
        isCategorical: true as const,
        id: e.id,
      }
    }
    if (axis.kind === 'cn_ratio') {
      const r = cnRatioOf(e)
      if (r === null) return null
      return { x: r, y: v, isCategorical: false as const, id: e.id }
    }
    const c = componentConcOf(e, axis.source, axis.componentName)
    if (c === null) return null
    return { x: c, y: v, isCategorical: false as const, id: e.id }
  }).filter(Boolean) as MediaScanPoint[]
}
