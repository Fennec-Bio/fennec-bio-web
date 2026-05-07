'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Clipboard, Download, Sparkles } from 'lucide-react'
import { fetchAiReport } from '@/lib/analysis/api'
import { OUTCOME_METRICS } from '@/lib/analysis/constants'
import { aiReportToMarkdown, normalizeAiReport } from '@/lib/analysis/aiReportMarkdown'
import type {
  AiReport as AiReportType,
  CohortPayload,
  OutcomeMetric,
} from '@/lib/analysis/types'

export function AiReport({
  ids,
  outcome,
  product,
  payload,
}: {
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
  payload: CohortPayload
}) {
  const { getToken } = useAuth()
  const [report, setReport] = useState<AiReportType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const metric = OUTCOME_METRICS.find(m => m.id === outcome)
  const productMissing = Boolean(metric?.productSpecific && !product)

  const generate = async () => {
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      const token = await getToken()
      const next = await fetchAiReport(token, ids, outcome, product)
      const normalized = normalizeAiReport(next)
      setReport({
        ...normalized,
        evidence_summary: {
          ...normalized.evidence_summary,
          outcome: normalized.evidence_summary.outcome || outcome,
          product: normalized.evidence_summary.product ?? product,
        },
      })
    } catch (e) {
      setError(String(e))
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  const markdown = report ? aiReportToMarkdown(report) : ''

  const copy = async () => {
    if (!markdown) return
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
  }

  const download = () => {
    if (!markdown) return
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ai-analysis-${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-md p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Analysis</h2>
            <p className="text-sm text-gray-500 mt-1">
              {ids.length} experiments selected - {metric?.label ?? outcome}
              {product ? ` - ${product}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {report && (
              <>
                <button
                  type="button"
                  onClick={copy}
                  className="h-9 px-3 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 inline-flex items-center gap-2"
                >
                  <Clipboard className="h-4 w-4" />
                  {copied ? 'Copied' : 'Copy report'}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="h-9 px-3 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-100 inline-flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download .md
                </button>
              </>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={loading || ids.length === 0 || productMissing}
              className="h-9 px-4 rounded-md text-sm font-medium text-white bg-[#eb5234] hover:bg-[#d8492e] disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? 'Generating...' : 'Generate analysis'}
            </button>
          </div>
        </div>
        {productMissing && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800 p-3">
            Select a product before generating an AI report for this outcome.
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">
            {error}
          </div>
        )}
      </div>

      {loading && <ReportSkeleton />}
      {!loading && !report && (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Generate an AI report to summarize this cohort and propose next experiments.
        </div>
      )}
      {report && !loading && (
        <GeneratedReport report={report} fallbackCount={payload.experiments.length} />
      )}
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
      <div className="h-4 w-1/3 bg-gray-200 rounded animate-pulse" />
      <div className="h-16 bg-gray-100 rounded animate-pulse" />
      <div className="h-24 bg-gray-100 rounded animate-pulse" />
      <div className="h-32 bg-gray-100 rounded animate-pulse" />
    </div>
  )
}

function GeneratedReport({
  report,
  fallbackCount,
}: {
  report: AiReportType
  fallbackCount: number
}) {
  return (
    <div className="space-y-4">
      <section className="bg-white border border-gray-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Executive Summary</h3>
        <p className="text-sm text-gray-700 leading-6">{report.executive_summary}</p>
        <div className="mt-3 text-xs text-gray-500">
          Evidence: {report.evidence_summary.experiment_count || fallbackCount} experiments
          {' - '}
          {report.evidence_summary.outcome}
          {report.evidence_summary.product ? ` - ${report.evidence_summary.product}` : ''}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Key Findings</h3>
        <div className="space-y-3">
          {report.key_findings.map((finding, index) => (
            <div key={`${finding.title}-${index}`} className="border border-gray-100 rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-gray-900">{finding.title}</h4>
                <span className="text-xs text-gray-500">{finding.confidence}</span>
              </div>
              <p className="text-sm text-gray-700 mt-1">{finding.explanation}</p>
              <EvidenceList items={finding.evidence} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Hypotheses</h3>
        <div className="space-y-3">
          {report.hypotheses.map((hypothesis, index) => (
            <div key={`${hypothesis.title}-${index}`} className="border border-gray-100 rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-gray-900">{hypothesis.title}</h4>
                <span className="text-xs text-gray-500">{hypothesis.confidence}%</span>
              </div>
              <p className="text-sm text-gray-700 mt-1">{hypothesis.rationale}</p>
              {hypothesis.speculative && (
                <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                  speculative
                </span>
              )}
              <EvidenceList items={hypothesis.supporting_evidence} />
              <p className="text-xs text-gray-500 mt-2">
                Uncertainty: {hypothesis.uncertainty}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recommended Experiments</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {report.recommended_experiments.map((experiment, index) => (
            <div key={`${experiment.title}-${index}`} className="border border-gray-200 rounded-md p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-gray-900">{experiment.title}</h4>
                <span className="text-xs text-gray-500">{experiment.experiment_type}</span>
              </div>
              <p className="text-sm text-gray-700 mt-2">{experiment.objective}</p>
              <Detail label="Rationale" value={experiment.rationale} />
              <Detail label="Variables" value={experiment.variables_to_change.join(', ') || 'None listed'} />
              <Detail label="Controls" value={experiment.controls.join(', ') || 'None listed'} />
              <Detail label="Readouts" value={experiment.key_readouts.join(', ') || 'None listed'} />
              <Detail label="Expected outcome" value={experiment.expected_outcome} />
              <Detail label="Risk" value={experiment.risk} />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Caveats</h3>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          {report.caveats.map((caveat, index) => (
            <li key={`${caveat}-${index}`}>{caveat}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function EvidenceList({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-2 list-disc pl-5 text-xs text-gray-500 space-y-1">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 text-xs">
      <span className="font-medium text-gray-700">{label}: </span>
      <span className="text-gray-600">{value}</span>
    </div>
  )
}
