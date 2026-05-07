import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AiReport } from './types'
import { aiReportToMarkdown, normalizeAiReport } from './aiReportMarkdown'

const report: AiReport = {
  executive_summary: 'Run A outperformed compromised runs.',
  key_findings: [
    {
      title: 'Best run was clean',
      explanation: 'Ferm A had the highest final titer.',
      evidence: ['Ferm A final_titer CBDa=1200', 'No anomalies on Ferm A'],
      confidence: 'high',
    },
  ],
  hypotheses: [
    {
      title: 'Foaming reduced oxygen transfer',
      rationale: 'Low performers had foam-over anomalies.',
      supporting_evidence: ['Ferm B anomaly: Foam over'],
      uncertainty: 'No DO trace was included.',
      confidence: 72,
      speculative: true,
    },
  ],
  recommended_experiments: [
    {
      title: 'Antifoam comparison',
      experiment_type: 'process',
      objective: 'Test whether foam control improves CBDa.',
      rationale: 'Foam-over appears in low performers.',
      variables_to_change: ['antifoam type'],
      controls: ['Current antifoam condition'],
      key_readouts: ['CBDa final titer', 'foam events'],
      expected_outcome: 'Improved foam control increases titer.',
      risk: 'Antifoam may alter oxygen transfer independently.',
    },
  ],
  caveats: ['Only two runs had notes.'],
  evidence_summary: {
    experiment_count: 3,
    outcome: 'final_titer',
    product: 'CBDa',
    warnings: ['truncated'],
  },
}

describe('aiReportToMarkdown', () => {
  it('renders a copyable report with evidence and experiment cards', () => {
    const md = aiReportToMarkdown(report)

    assert.ok(md.includes('# AI Analysis Report'))
    assert.ok(md.includes('Run A outperformed compromised runs.'))
    assert.ok(md.includes('Evidence: Ferm A final_titer CBDa=1200; No anomalies on Ferm A'))
    assert.ok(md.includes('## Recommended Experiments'))
    assert.ok(md.includes('Objective: Test whether foam control improves CBDa.'))
    assert.ok(md.includes('Warnings: truncated'))
  })

  it('does not crash when evidence summary warnings are omitted', () => {
    const reportWithoutWarnings = {
      ...report,
      evidence_summary: {
        experiment_count: 3,
        outcome: 'final_titer',
        product: 'CBDa',
      },
    } as unknown as AiReport

    const md = aiReportToMarkdown(reportWithoutWarnings)

    assert.ok(md.includes('Outcome: final_titer'))
    assert.ok(!md.includes('Warnings:'))
  })

  it('does not crash when AI omits report array sections', () => {
    const reportWithoutArrays = {
      executive_summary: 'Sparse report.',
      evidence_summary: {
        experiment_count: 3,
        outcome: 'final_titer',
        product: 'CBDa',
      },
    } as unknown as AiReport

    const md = aiReportToMarkdown(reportWithoutArrays)

    assert.ok(md.includes('Sparse report.'))
    assert.ok(md.includes('## Key Findings'))
    assert.ok(md.includes('## Hypotheses'))
    assert.ok(md.includes('## Recommended Experiments'))
    assert.ok(md.includes('## Caveats'))
  })

  it('preserves useful text when AI returns string sections and alias keys', () => {
    const looseReport = {
      executive_summary: 'Summary.',
      key_findings: [
        'CBDa titers varied across six runs.',
        {
          finding: 'Condition A produced the highest CBDa titer.',
          description: 'The best run outperformed the rest of the cohort.',
          evidence: 'Ferm A final_titer CBDa=1200',
          confidence: 'high',
        },
      ],
      hypotheses: [
        {
          hypothesis: 'Oxygen transfer affected productivity.',
          rationale: 'Lower performers showed process stress.',
          supporting_evidence: 'Low performers had process stress',
          confidence: 70,
        },
      ],
      recommended_experiments: [
        {
          experiment: 'Run a DO setpoint sweep.',
          variables: 'DO setpoint',
          readouts: 'CBDa final titer',
        },
      ],
      caveats: 'Small cohort.',
      evidence_summary: {
        experiment_count: 6,
        outcome: 'final_titer',
        product: 'CBDa',
      },
    } as unknown as AiReport

    const normalized = normalizeAiReport(looseReport)

    assert.equal(normalized.key_findings[0].title, 'CBDa titers varied across six runs.')
    assert.equal(normalized.key_findings[1].title, 'Condition A produced the highest CBDa titer.')
    assert.deepEqual(normalized.key_findings[1].evidence, ['Ferm A final_titer CBDa=1200'])
    assert.equal(normalized.hypotheses[0].title, 'Oxygen transfer affected productivity.')
    assert.deepEqual(normalized.hypotheses[0].supporting_evidence, ['Low performers had process stress'])
    assert.equal(normalized.recommended_experiments[0].title, 'Run a DO setpoint sweep.')
    assert.deepEqual(normalized.recommended_experiments[0].variables_to_change, ['DO setpoint'])
    assert.deepEqual(normalized.recommended_experiments[0].key_readouts, ['CBDa final titer'])
    assert.deepEqual(normalized.caveats, ['Small cohort.'])
  })
})
