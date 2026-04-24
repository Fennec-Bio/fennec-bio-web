import type { AnalysisSlug, OutcomeMetric, ThemeId } from './types'

export const OUTCOME_METRICS: Array<{
  id: OutcomeMetric
  label: string
  productSpecific: boolean
}> = [
  { id: 'final_titer',    label: 'Final titer',                 productSpecific: true  },
  { id: 'max_titer',      label: 'Max titer',                   productSpecific: true  },
  { id: 'productivity',   label: 'Volumetric productivity',     productSpecific: true  },
  { id: 'yps',            label: 'Y p/s (yield on substrate)',  productSpecific: true  },
  { id: 'ypx',            label: 'Y p/x (yield on biomass)',    productSpecific: true  },
  { id: 'biomass',        label: 'Final / peak biomass',        productSpecific: false },
  { id: 'mu_max',         label: 'μ max (growth rate)',         productSpecific: false },
  { id: 'substrate_rate', label: 'Substrate consumption rate',  productSpecific: false },
]

export const THEMES: Array<{
  id: ThemeId
  label: string
  analyses: Array<{ slug: AnalysisSlug; label: string; availableInP1: boolean }>
}> = [
  { id: 'kinetics', label: 'Kinetics', analyses: [
    { slug: 'kinetic-overlay',    label: 'Overlay',              availableInP1: true  },
    { slug: 'derived-parameters', label: 'Derived parameters',   availableInP1: true  },
  ]},
  { id: 'doe', label: 'Variable impact & DoE', analyses: [
    { slug: 'anova-heatmap',    label: 'ANOVA heatmap',     availableInP1: true  },
    { slug: 'main-effects',     label: 'Main effects',      availableInP1: true  },
    { slug: 'response-surface', label: 'Response surface',  availableInP1: false },
    { slug: 'pareto',           label: 'Pareto',            availableInP1: true  },
    { slug: 'regression',       label: 'Regression',        availableInP1: true  },
  ]},
  { id: 'metabolic', label: 'Metabolic eng.', analyses: [
    { slug: 'strain-lineage', label: 'Strain lineage',       availableInP1: true  },
    { slug: 'carbon-balance', label: 'Carbon balance',       availableInP1: false },
    { slug: 'yield-summary',  label: 'Yield summary',        availableInP1: true  },
    { slug: 'media-scan',     label: 'Media component scan', availableInP1: false },
  ]},
  { id: 'pattern', label: 'Pattern finding', analyses: [
    { slug: 'pca',         label: 'PCA biplot',         availableInP1: false },
    { slug: 'cohort-diff', label: 'Best-vs-worst diff', availableInP1: false },
  ]},
]

export const DEFAULT_THEME: ThemeId = 'kinetics'
export const DEFAULT_ANALYSIS: AnalysisSlug = 'kinetic-overlay'
