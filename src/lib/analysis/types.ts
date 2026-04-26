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

export interface MediaComponent {
  name: string
  concentration: number | null
  molecular_weight: number | null
}

export interface MediaInPayload {
  id: number
  name: string
  type: string
  carbon_sources: MediaComponent[]
  nitrogen_sources: MediaComponent[]
  complex_components: MediaComponent[]
  additional_components: MediaComponent[]
}

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
  batch_media: MediaInPayload | null
  feed_media: MediaInPayload | null
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

export interface MainEffectLevel {
  level: string
  mean: number
  stderr: number
  n: number
}

export interface MainEffectFactor {
  factor: string
  levels: MainEffectLevel[]
}

export interface InteractionCell {
  level_a: string
  level_b: string
  mean: number
  stderr: number
  n: number
}

export interface InteractionEntry {
  factor_a: string
  factor_b: string
  grid: InteractionCell[]
}

export interface MainEffectsResult {
  main_effects: MainEffectFactor[]
  interactions: InteractionEntry[]
}

export interface ParetoEffect {
  name: string
  coefficient: number
  stderr: number
  standardized: number
  significant: boolean
}

export interface ParetoResult {
  effects: ParetoEffect[]
  cutoff: number
  n: number
}

export type RegressionModelType = 'linear' | 'polynomial_2'

export interface RegressionCoefficient {
  name: string
  coef: number
  stderr: number
  t: number
  ci_low: number
  ci_high: number
  p: number
}

export interface RegressionResidual {
  predicted: number
  observed: number
  residual: number
}

export interface RegressionResult {
  coefficients: RegressionCoefficient[]
  r_squared: number
  adjusted_r_squared: number
  residuals: RegressionResidual[]
  fitted: number[]
  model_type: RegressionModelType
  feature_names: string[]
  n: number
  dof: number
}

export interface RegressionPrediction {
  prediction: number
  model_type: RegressionModelType
  fit: {
    r_squared: number
    adjusted_r_squared: number
  }
}

export interface ResponseSurfaceResult {
  beta: number[]
  r_squared: number
  x_range: [number, number]
  y_range: [number, number]
  x_grid: number[]
  y_grid: number[]
  z_grid: number[][]
  observed_points: Array<{ x: number; y: number; z: number }>
  optimum: { x: number; y: number; predicted_outcome: number } | null
}

export interface PcaScore { experiment_id: number; pc1: number; pc2: number }
export interface PcaLoading { variable: string; pc1: number; pc2: number }

export interface PcaResult {
  scores: PcaScore[]
  loadings: PcaLoading[]
  explained_variance: [number, number]
}
