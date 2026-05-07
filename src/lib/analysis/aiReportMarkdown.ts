import type {
  AiReport,
  AiReportExperimentType,
  AiReportFinding,
  AiReportHypothesis,
  AiReportRecommendedExperiment,
} from './types'

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  return asArray(value).filter((item): item is string => typeof item === 'string')
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function asConfidence(value: unknown): AiReportFinding['confidence'] {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium'
}

function asExperimentType(value: unknown): AiReportExperimentType {
  const validTypes: AiReportExperimentType[] = [
    'strain_engineering',
    'media',
    'process',
    'control',
    'analytics',
    'validation',
    'other',
  ]
  return validTypes.includes(value as AiReportExperimentType)
    ? value as AiReportExperimentType
    : 'other'
}

function normalizeFinding(value: unknown): AiReportFinding {
  if (typeof value === 'string') {
    return {
      title: value,
      explanation: '',
      evidence: [],
      confidence: 'medium',
    }
  }
  const row = asRecord(value)
  const title = firstString(
    row.title,
    row.finding,
    row.key_finding,
    row.summary,
    row.observation,
    row.insight,
  )
  return {
    title: title ?? 'Finding',
    explanation: firstString(row.explanation, row.description, row.detail, row.rationale) ?? '',
    evidence: asStringArray(row.evidence ?? row.supporting_evidence ?? row.support),
    confidence: asConfidence(row.confidence),
  }
}

function normalizeHypothesis(value: unknown): AiReportHypothesis {
  if (typeof value === 'string') {
    return {
      title: value,
      rationale: '',
      supporting_evidence: [],
      uncertainty: '',
      confidence: 0,
      speculative: false,
    }
  }
  const row = asRecord(value)
  const title = firstString(row.title, row.hypothesis, row.statement, row.summary)
  return {
    title: title ?? 'Hypothesis',
    rationale: firstString(row.rationale, row.explanation, row.description, row.reasoning) ?? '',
    supporting_evidence: asStringArray(row.supporting_evidence ?? row.evidence ?? row.support),
    uncertainty: firstString(row.uncertainty, row.caveat, row.limitation) ?? '',
    confidence: asNumber(row.confidence),
    speculative: asBoolean(row.speculative),
  }
}

function normalizeRecommendedExperiment(value: unknown): AiReportRecommendedExperiment {
  if (typeof value === 'string') {
    return {
      title: value,
      experiment_type: 'other',
      objective: '',
      rationale: '',
      variables_to_change: [],
      controls: [],
      key_readouts: [],
      expected_outcome: '',
      risk: '',
    }
  }
  const row = asRecord(value)
  const title = firstString(
    row.title,
    row.experiment,
    row.recommended_experiment,
    row.recommendation,
    row.name,
  )
  return {
    title: title ?? 'Recommended experiment',
    experiment_type: asExperimentType(row.experiment_type),
    objective: firstString(row.objective, row.goal, row.purpose, row.description) ?? '',
    rationale: firstString(row.rationale, row.reasoning, row.explanation) ?? '',
    variables_to_change: asStringArray(row.variables_to_change ?? row.variables ?? row.variable_changes),
    controls: asStringArray(row.controls),
    key_readouts: asStringArray(row.key_readouts ?? row.readouts ?? row.readout),
    expected_outcome: firstString(row.expected_outcome, row.expected_result, row.outcome) ?? '',
    risk: firstString(row.risk, row.risks) ?? '',
  }
}

export function normalizeAiReport(report: AiReport): AiReport {
  const raw = asRecord(report)
  const evidenceSummary = asRecord(raw.evidence_summary)

  return {
    executive_summary: asString(raw.executive_summary),
    key_findings: asArray(raw.key_findings).map(normalizeFinding),
    hypotheses: asArray(raw.hypotheses).map(normalizeHypothesis),
    recommended_experiments: asArray(raw.recommended_experiments).map(normalizeRecommendedExperiment),
    caveats: asStringArray(raw.caveats),
    evidence_summary: {
      experiment_count: asNumber(evidenceSummary.experiment_count),
      outcome: asString(evidenceSummary.outcome),
      product: typeof evidenceSummary.product === 'string' ? evidenceSummary.product : null,
      warnings: asStringArray(evidenceSummary.warnings),
    },
  }
}

function list(items: string[]): string {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- None listed'
}

export function aiReportToMarkdown(report: AiReport): string {
  const normalized = normalizeAiReport(report)
  const lines: string[] = []
  lines.push('# AI Analysis Report')
  lines.push('')
  lines.push(`Experiments: ${normalized.evidence_summary.experiment_count}`)
  lines.push(`Outcome: ${normalized.evidence_summary.outcome}`)
  lines.push(`Product: ${normalized.evidence_summary.product ?? 'n/a'}`)
  const warnings = normalized.evidence_summary.warnings ?? []
  if (warnings.length) {
    lines.push(`Warnings: ${warnings.join(', ')}`)
  }
  lines.push('')
  lines.push('## Executive Summary')
  lines.push('')
  lines.push(normalized.executive_summary)
  lines.push('')
  lines.push('## Key Findings')
  lines.push('')
  for (const finding of normalized.key_findings) {
    lines.push(`### ${finding.title}`)
    lines.push('')
    lines.push(finding.explanation)
    lines.push('')
    lines.push(`Confidence: ${finding.confidence}`)
    lines.push(`Evidence: ${finding.evidence.join('; ') || 'None listed'}`)
    lines.push('')
  }
  lines.push('## Hypotheses')
  lines.push('')
  for (const hypothesis of normalized.hypotheses) {
    lines.push(`### ${hypothesis.title}`)
    lines.push('')
    lines.push(hypothesis.rationale)
    lines.push('')
    lines.push(`Confidence: ${hypothesis.confidence}%`)
    lines.push(`Speculative: ${hypothesis.speculative ? 'yes' : 'no'}`)
    lines.push(`Evidence: ${hypothesis.supporting_evidence.join('; ') || 'None listed'}`)
    lines.push(`Uncertainty: ${hypothesis.uncertainty}`)
    lines.push('')
  }
  lines.push('## Recommended Experiments')
  lines.push('')
  for (const exp of normalized.recommended_experiments) {
    lines.push(`### ${exp.title}`)
    lines.push('')
    lines.push(`Type: ${exp.experiment_type}`)
    lines.push(`Objective: ${exp.objective}`)
    lines.push(`Rationale: ${exp.rationale}`)
    lines.push('')
    lines.push('Variables to change:')
    lines.push(list(exp.variables_to_change))
    lines.push('')
    lines.push('Controls:')
    lines.push(list(exp.controls))
    lines.push('')
    lines.push('Key readouts:')
    lines.push(list(exp.key_readouts))
    lines.push('')
    lines.push(`Expected outcome: ${exp.expected_outcome}`)
    lines.push(`Risk: ${exp.risk}`)
    lines.push('')
  }
  lines.push('## Caveats')
  lines.push('')
  lines.push(list(normalized.caveats))
  lines.push('')
  return lines.join('\n')
}
