# AI Analysis Tab - Design Spec

**Date:** 2026-05-07
**Scope:** Frontend (`frontend/`) and Backend (`backend/`)
**Status:** Approved for implementation planning

## Summary

Add a new top-level **AI** section to the Analysis page. The AI section generates an on-demand report for the currently selected cohort, using the structured analysis data plus experiment notes, events, and anomalies. The report interprets selected data and recommends next experiments across strain engineering, media, process conditions, controls, analytical validation, and follow-up validation.

The report is not saved to the database in v1. Users can copy the report or export it as Markdown.

## Decisions

- **Primary job:** Interpret selected cohort data and recommend next experiments.
- **Evidence source:** Structured cohort data plus experiment notes, events, and anomalies.
- **Generation mode:** On demand via a `Generate analysis` button.
- **Recommendation style:** Aggressive scientific ideation is allowed, with clear evidence/speculation labeling.
- **Experiment scope:** All experiment classes are in scope.
- **Navigation:** New top-level Analysis theme named `AI`.
- **Layout:** Report-style page in reading order.
- **Recommendation detail:** Actionable experiment cards.
- **Persistence:** Copy/export only; no saved AI report objects in v1.
- **Provider:** Existing backend OpenAI setup.

## Architecture

The frontend adds an `AI` theme to the existing analysis navigation. It contains one sub-tab, also `AI`, and renders a report page.

The frontend calls a new backend endpoint:

```http
POST /api/analysis/ai-report/
```

Request body:

```json
{
  "experiment_ids": [1, 2, 3],
  "outcome": "final_titer",
  "product": "CBDa"
}
```

The backend:

1. Validates that every experiment belongs to the active organization.
2. Builds the existing cohort payload.
3. Adds experiment notes, events, anomalies, and relevant metadata.
4. Compresses the source data into a prompt-safe evidence packet.
5. Calls OpenAI using `OPENAI_API_KEY`.
6. Parses a structured JSON response.
7. Returns the report data to the frontend.

The frontend does not call OpenAI directly and no OpenAI key is exposed to the browser.

## Backend Design

### Endpoint

Add `AiReportView` to `backend/app/analysis/views.py` and route it from `backend/app/analysis/urls.py`:

```python
path("ai-report/", AiReportView.as_view(), name="analysis-ai-report")
```

Permissions:

```python
permission_classes = [IsAuthenticated, IsOrgMember]
```

Validation follows the existing `_validate_cohort_request` pattern used by regression, main effects, Pareto, and response surface endpoints.

### Evidence Builder

Add a focused helper module, likely `backend/app/analysis/ai_report.py`, with responsibilities split into small functions:

- `build_ai_evidence_packet(ids, org, outcome, product)`
- `generate_ai_report(evidence_packet)`
- `parse_ai_report_response(response_text)`
- `markdown_from_ai_report(report)` if backend export support is desired later

The evidence packet should include:

- Experiment title, date, strain, parent strain, strain modifications.
- Batch/feed media names and media components.
- Variables as name/value pairs.
- Selected outcome value for the requested outcome/product.
- Key secondary outcomes when available.
- Time-series summaries, not full raw dense arrays: final/max values, productivity-like signals, substrate/biomass availability, missing series markers.
- Experiment notes, events, and anomalies.
- Existing cohort warnings.
- Simple ranked contrasts: best/worst experiments, repeated high-performer variables, repeated low-performer variables, and recurring anomaly context.

The packet should not send unlimited raw time-series data. If a selected cohort is too large or notes are too long, the builder should truncate deterministically and include a `truncation_warnings` section so the model and UI can disclose that not all raw context was sent.

### OpenAI Call

Use the existing `OPENAI_API_KEY` setting. If it is missing, return:

```json
{
  "code": "ai_not_configured",
  "message": "AI analysis is not configured"
}
```

with HTTP 503.

Use JSON response format so the frontend receives a stable shape. The prompt should instruct the model to:

- Do not invent observed values not present in the evidence packet.
- Cite selected-data evidence by experiment title, variable name, note/event/anomaly, or outcome name.
- Separate data-backed findings from speculative hypotheses.
- Make creative recommendations when useful, but label uncertainty.
- Avoid presenting recommendations as validated conclusions.

### Response Shape

Return structured JSON:

```ts
interface AiReport {
  executive_summary: string
  key_findings: Array<{
    title: string
    explanation: string
    evidence: string[]
    confidence: 'low' | 'medium' | 'high'
  }>
  hypotheses: Array<{
    title: string
    rationale: string
    supporting_evidence: string[]
    uncertainty: string
    confidence: number
    speculative: boolean
  }>
  recommended_experiments: Array<{
    title: string
    experiment_type: 'strain_engineering' | 'media' | 'process' | 'control' | 'analytics' | 'validation' | 'other'
    objective: string
    rationale: string
    variables_to_change: string[]
    controls: string[]
    key_readouts: string[]
    expected_outcome: string
    risk: string
  }>
  caveats: string[]
  evidence_summary: {
    experiment_count: number
    outcome: string
    product: string | null
    warnings: string[]
  }
}
```

## Frontend Design

### Navigation

Extend `frontend/src/lib/analysis/types.ts`:

```ts
export type AnalysisSlug = ... | 'ai-report'
export type ThemeId = ... | 'ai'
```

Extend `frontend/src/lib/analysis/constants.ts` with:

```ts
{ id: 'ai', label: 'AI', analyses: [
  { slug: 'ai-report', label: 'AI', availableInP1: true },
]}
```

The new theme appears alongside existing analysis themes.

### API Client

Add `fetchAiReport` to `frontend/src/lib/analysis/api.ts`. It posts selected IDs, outcome, and product to `/api/analysis/ai-report/` and returns the structured report.

Add matching TypeScript interfaces to `frontend/src/lib/analysis/types.ts`.

### Component

Add `frontend/src/components/dashboard/analysis/AiReport.tsx`.

The component receives:

```ts
{
  ids: number[]
  outcome: OutcomeMetric
  product: string | null
  payload: CohortPayload
}
```

Behavior:

- If no experiments are selected, show an empty state telling the user to pick experiments.
- Show cohort count, selected outcome/product, and a `Generate analysis` button.
- On click, call `fetchAiReport`.
- Render loading skeleton/working state while the backend calls OpenAI.
- Render backend errors in a clear inline error block.
- Render successful reports in reading order:
  1. Executive Summary
  2. Key Findings
  3. Hypotheses
  4. Recommended Experiments
  5. Caveats
- Provide `Copy report` and `Download .md` actions.

### Markdown Export

The frontend can convert the structured report to Markdown locally. Include:

- Header with cohort count and selected outcome/product.
- Executive summary.
- Bulleted findings with evidence.
- Ranked hypotheses.
- Recommended experiment cards.
- Caveats.

PDF export is out of scope for v1.

## Error States

The UI should handle:

- No selected experiments.
- Missing product for product-specific outcomes.
- AI not configured (`503`, `ai_not_configured`).
- Cross-org or missing experiment (`404`).
- Payload too large or truncated warning.
- OpenAI failure (`502`).
- Malformed AI JSON (`502`).

## Testing

### Backend Tests

Add tests in `backend/app/tests/test_analysis_views.py` or a focused `test_analysis_ai_report.py`:

1. Happy path with mocked OpenAI response.
2. Empty or missing `experiment_ids` returns 400.
3. Cross-org experiment IDs return 404.
4. Missing `OPENAI_API_KEY` returns 503 with `ai_not_configured`.
5. Malformed AI JSON returns a safe 502 response.
6. Evidence builder includes notes, events, anomalies, variables, outcomes, and cohort warnings.
7. Evidence builder truncates large inputs deterministically and reports truncation warnings.

### Frontend Verification

The current frontend setup has lint/build rather than a broad component test harness. Verify:

```bash
cd frontend
npm run lint
npm run build
```

Manual checks:

1. `AI` theme appears on `/dashboard/analysis`.
2. Empty selected cohort shows the empty state.
3. Generate button sends selected IDs/outcome/product.
4. Loading, success, and error states render correctly.
5. Copy report places Markdown on clipboard.
6. Download creates a `.md` report.
7. Switching to another theme preserves the selected cohort.

## Out Of Scope

- Saving AI reports to the database.
- Report history/versioning.
- PDF export.
- Interactive chat.
- Automatic generation on cohort changes.
- Provider abstraction beyond the existing OpenAI setup.
- Literature retrieval or external web/literature grounding.
- Creating experiments directly from recommended experiment cards.

