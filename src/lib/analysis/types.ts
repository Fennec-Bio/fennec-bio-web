export type OutcomeMetric =
  | 'final_titer' | 'max_titer' | 'productivity'
  | 'yps' | 'ypx' | 'biomass' | 'mu_max' | 'substrate_rate'

export type AnalysisSlug =
  | 'kinetic-overlay' | 'derived-parameters'
  | 'anova-heatmap' | 'main-effects' | 'response-surface'
  | 'pareto' | 'regression'
  | 'strain-lineage' | 'carbon-balance' | 'yield-summary' | 'media-scan'
  | 'pca' | 'cohort-diff'

export type ThemeId = 'kinetics' | 'doe' | 'metabolic' | 'pattern'

export interface TimeSeriesEntry {
  category: 'product' | 'secondary_product' | 'process_data'
  name: string
  role: 'substrate' | 'biomass' | null
  unit: string
  timepoints_h: number[]
  values: number[]
}

export interface ExperimentInPayload {
  id: number
  title: string
  date: string | null
  project_id: number
  strain: {
    id: number
    name: string
    parent_strain: { id: number; name: string } | null
    modifications: Array<{ modification_type: string; gene_name: string }>
  } | null
  batch_media: { id: number; name: string; type: string } | null
  feed_media: { id: number; name: string; type: string } | null
  variables: Array<{ name: string; value: string }>
  outcomes: {
    final_titer: Record<string, number | null>
    max_titer: Record<string, number | null>
    productivity: Record<string, number | null>
    yps: Record<string, number | null>
    ypx: Record<string, number | null>
    biomass: number | null
    mu_max: number | null
    substrate_rate: number | null
  }
  time_series: TimeSeriesEntry[]
}

export interface CohortPayload {
  experiments: ExperimentInPayload[]
  products: string[]
  role_map_version: number
  warnings: Array<{ experiment_id: number; code: string; affects: string[] }>
}

export interface AnovaImpact {
  variable: string
  eta_squared: number
  p_value: number
  f_statistic: number
  n: number
  groups: number
  group_data: Array<{
    group: string
    values: number[]
    experiments: Array<{ id: number; value: number }>
  }>
}

export interface AnovaResult {
  impacts: AnovaImpact[]
  n: number
}
