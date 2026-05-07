# AI Analysis Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-demand AI report tab for selected Analysis cohorts, using backend OpenAI generation over structured cohort data plus notes/events/anomalies.

**Architecture:** Add a Django `POST /api/analysis/ai-report/` endpoint that validates org-scoped experiment IDs, builds a bounded evidence packet, calls OpenAI, parses structured JSON, and returns an AI report. Add frontend types/API helpers plus an `AiReport` Analysis component with copy/download Markdown actions and route it through the existing analysis theme state.

**Tech Stack:** Django 5.1 + DRF, OpenAI Python SDK, Next.js 16, React 19, TypeScript, Tailwind CSS, Node `node:test` for pure frontend helpers.

---

## File Structure

- Create `backend/app/analysis/ai_report.py`
  - Owns evidence packet construction, prompt text, OpenAI call, AI response parsing, and deterministic truncation.
- Create `backend/app/tests/test_analysis_ai_report.py`
  - Covers evidence builder behavior, endpoint validation, mocked OpenAI success, missing config, malformed response, and cross-org isolation.
- Modify `backend/app/analysis/views.py`
  - Adds `AiReportView` using existing `_validate_cohort_request`.
- Modify `backend/app/analysis/urls.py`
  - Adds `ai-report/` route.
- Modify `frontend/src/lib/analysis/types.ts`
  - Adds `ai-report` slug, `ai` theme, and `AiReport` wire types.
- Modify `frontend/src/lib/analysis/constants.ts`
  - Adds AI theme without disturbing existing uncommitted carbon analysis entries.
- Modify `frontend/src/lib/analysis/api.ts`
  - Adds `fetchAiReport`.
- Create `frontend/src/lib/analysis/aiReportMarkdown.ts`
  - Converts structured AI reports into Markdown for copy/download.
- Create `frontend/src/lib/analysis/aiReportMarkdown.test.ts`
  - Pure helper tests.
- Create `frontend/src/components/dashboard/analysis/AiReport.tsx`
  - Report UI, generate button, loading/error states, copy/download actions.
- Modify `frontend/src/app/dashboard/analysis/page.tsx`
  - Imports and renders `AiReport`; includes it in outcome/product picker analyses.

---

### Task 1: Backend Evidence Builder Tests

**Files:**
- Create: `backend/app/tests/test_analysis_ai_report.py`
- Later create: `backend/app/analysis/ai_report.py`

- [ ] **Step 1: Write failing tests for evidence packet content and truncation**

Add this file:

```python
import json
from unittest.mock import Mock, patch

from django.test import RequestFactory, TestCase, override_settings
from rest_framework.test import force_authenticate


def _post(user, org, path, body):
    request = RequestFactory().post(
        path, data=json.dumps(body), content_type="application/json",
    )
    force_authenticate(request, user=user)
    request.user = user
    request.user.active_organization = org
    return request


def _ai_body(experiment_ids, product="CBDa"):
    return {
        "experiment_ids": experiment_ids,
        "outcome": "final_titer",
        "product": product,
    }


class AiReportEvidenceTests(TestCase):
    def setUp(self):
        from app.models import (
            Anomaly, ClerkUser, DataCategory, DataPoint, Event, Experiment,
            Membership, Organization, Project, Strain, StrainModification,
            Variable,
        )

        self.org = Organization.objects.create(clerk_org_id="org_ai", name="AI Org")
        self.user = ClerkUser.objects.create(
            clerk_id="u_ai", email="ai@example.com",
        )
        Membership.objects.create(
            user=self.user, organization=self.org, role="admin",
        )
        self.project = Project.objects.create(organization=self.org, name="AI Project")
        parent = Strain.objects.create(organization=self.org, name="Parent-1")
        self.strain = Strain.objects.create(
            organization=self.org, name="Strain-1", parent_strain=parent,
        )
        StrainModification.objects.create(
            strain=self.strain, modification_type="overexpression",
            gene_name="ACC1",
        )
        self.cat = DataCategory.objects.create(
            project=self.project, category="product", name="CBDa",
            unit="mg/L", role="other",
        )
        self.exp = Experiment.objects.create(
            title="Ferm AI-1",
            project=self.project,
            strain=self.strain,
            experiment_note="Observed clean growth and high late CBDa.",
        )
        Variable.objects.create(experiment=self.exp, name="temperature", value="26")
        Event.objects.create(experiment=self.exp, name="Feed start", timepoint=12)
        Anomaly.objects.create(
            experiment=self.exp, name="Foam over", timepoint=18,
            description="Brief foam-over after antifoam pump delay.",
        )
        for t, value in [(0, 0.0), (24, 500.0), (48, 1200.0)]:
            DataPoint.objects.create(
                experiment=self.exp, data_category=self.cat,
                category="product", name="CBDa", value=value,
                timepoint=t, time_unit="hours", data_type="continuous",
                unit="mg/L",
            )

    def test_evidence_packet_includes_notes_events_anomalies_and_outcomes(self):
        from app.analysis.ai_report import build_ai_evidence_packet

        packet = build_ai_evidence_packet(
            [self.exp.id], self.org, outcome="final_titer", product="CBDa",
        )

        self.assertEqual(packet["cohort"]["experiment_count"], 1)
        exp = packet["experiments"][0]
        self.assertEqual(exp["title"], "Ferm AI-1")
        self.assertEqual(exp["selected_outcome"]["value"], 1200.0)
        self.assertEqual(exp["notes"], "Observed clean growth and high late CBDa.")
        self.assertEqual(exp["events"][0]["name"], "Feed start")
        self.assertEqual(exp["anomalies"][0]["name"], "Foam over")
        self.assertEqual(exp["strain"]["modifications"][0]["gene_name"], "ACC1")
        self.assertEqual(exp["variables"][0], {"name": "temperature", "value": "26"})
        self.assertEqual(exp["time_series_summary"][0]["max"], 1200.0)

    def test_evidence_packet_truncates_long_notes_deterministically(self):
        from app.analysis.ai_report import build_ai_evidence_packet

        self.exp.experiment_note = "x" * 5000
        self.exp.save(update_fields=["experiment_note"])

        packet = build_ai_evidence_packet(
            [self.exp.id], self.org, outcome="final_titer", product="CBDa",
        )

        exp = packet["experiments"][0]
        self.assertLessEqual(len(exp["notes"]), 1200)
        self.assertIn("truncated", packet["cohort"]["warnings"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
python manage.py test app.tests.test_analysis_ai_report.AiReportEvidenceTests
```

Expected: fails with `ModuleNotFoundError: No module named 'app.analysis.ai_report'`.

---

### Task 2: Backend Evidence Builder Implementation

**Files:**
- Create: `backend/app/analysis/ai_report.py`

- [ ] **Step 1: Implement minimal evidence builder**

Create `backend/app/analysis/ai_report.py`:

```python
"""AI report helpers for cohort analysis."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from typing import Any

from django.conf import settings as django_settings

from app.analysis.cohort import build_cohort_payload
from app.models import Experiment, Organization


MAX_NOTE_CHARS = 1000
MAX_EVENTS = 20
MAX_ANOMALIES = 20
MAX_SERIES_PER_EXPERIMENT = 24
OPENAI_MODEL = "gpt-4o-mini"


class AiReportError(Exception):
    """Raised when AI generation or parsing fails in a user-safe way."""


@dataclass
class TruncatedText:
    value: str
    truncated: bool


def _truncate_text(value: str | None, max_chars: int = MAX_NOTE_CHARS) -> TruncatedText:
    text = (value or "").strip()
    if len(text) <= max_chars:
        return TruncatedText(text, False)
    return TruncatedText(text[: max_chars - 15].rstrip() + " [truncated]", True)


def _selected_outcome(outcomes: dict[str, Any], outcome: str, product: str | None) -> Any:
    if outcome in ("final_titer", "max_titer", "productivity", "yps", "ypx"):
        values = outcomes.get(outcome) or {}
        return values.get(product) if product else None
    return outcomes.get(outcome)


def _summarize_series(series: dict[str, Any]) -> dict[str, Any]:
    values = series.get("values") or []
    times = series.get("timepoints_h") or []
    summary = {
        "category": series.get("category"),
        "name": series.get("name"),
        "role": series.get("role"),
        "unit": series.get("unit"),
        "points": len(values),
    }
    if values:
        summary.update({
            "first": values[0],
            "last": values[-1],
            "min": min(values),
            "max": max(values),
        })
    if times:
        summary.update({"start_h": min(times), "end_h": max(times)})
    return summary


def _metadata_by_id(ids: list[int], org: Organization) -> dict[int, Experiment]:
    return {
        exp.id: exp
        for exp in Experiment.objects.filter(
            id__in=ids, project__organization=org,
        )
        .select_related("strain", "strain__parent_strain")
        .prefetch_related("events", "anomalies", "variables", "strain__modifications")
    }


def _ranked_contrasts(experiments: list[dict[str, Any]]) -> dict[str, Any]:
    scored = [
        exp for exp in experiments
        if isinstance(exp.get("selected_outcome", {}).get("value"), (int, float))
    ]
    scored.sort(key=lambda exp: exp["selected_outcome"]["value"], reverse=True)
    high = scored[:5]
    low = list(reversed(scored[-5:])) if len(scored) > 5 else scored[-5:]

    def variable_counts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        counts = Counter(
            f"{v['name']}={v['value']}"
            for exp in rows
            for v in exp.get("variables", [])
        )
        return [
            {"variable": key, "count": count}
            for key, count in counts.most_common(10)
        ]

    return {
        "top_experiments": [
            {
                "title": exp["title"],
                "value": exp["selected_outcome"]["value"],
            }
            for exp in high
        ],
        "bottom_experiments": [
            {
                "title": exp["title"],
                "value": exp["selected_outcome"]["value"],
            }
            for exp in low
        ],
        "top_variable_counts": variable_counts(high),
        "bottom_variable_counts": variable_counts(low),
    }


def build_ai_evidence_packet(
    experiment_ids: list[int],
    org: Organization,
    *,
    outcome: str,
    product: str | None,
) -> dict[str, Any]:
    payload = build_cohort_payload(experiment_ids, org)
    meta = _metadata_by_id(experiment_ids, org)
    warnings: list[str] = []
    experiments_out: list[dict[str, Any]] = []

    for exp_payload in payload["experiments"]:
        exp = meta[exp_payload["id"]]
        note = _truncate_text(exp.experiment_note)
        if note.truncated and "truncated" not in warnings:
            warnings.append("truncated")
        series = exp_payload.get("time_series", [])[:MAX_SERIES_PER_EXPERIMENT]
        if len(exp_payload.get("time_series", [])) > MAX_SERIES_PER_EXPERIMENT:
            warnings.append("time_series_truncated")

        selected_value = _selected_outcome(exp_payload["outcomes"], outcome, product)
        experiments_out.append({
            "id": exp.id,
            "title": exp.title,
            "date": exp.date.isoformat() if exp.date else None,
            "description": exp.description or "",
            "notes": note.value,
            "strain": exp_payload.get("strain"),
            "batch_media": exp_payload.get("batch_media"),
            "feed_media": exp_payload.get("feed_media"),
            "variables": exp_payload.get("variables", []),
            "selected_outcome": {
                "outcome": outcome,
                "product": product,
                "value": selected_value,
            },
            "outcomes": exp_payload.get("outcomes", {}),
            "time_series_summary": [_summarize_series(s) for s in series],
            "events": [
                {
                    "name": event.name,
                    "timepoint": event.timepoint,
                    "time_unit": event.time_unit,
                    "value": event.value,
                }
                for event in exp.events.all().order_by("timepoint", "id")[:MAX_EVENTS]
            ],
            "anomalies": [
                {
                    "name": anomaly.name,
                    "timepoint": anomaly.timepoint,
                    "time_unit": anomaly.time_unit,
                    "description": anomaly.description,
                }
                for anomaly in exp.anomalies.all().order_by("timepoint", "id")[:MAX_ANOMALIES]
            ],
        })

    packet = {
        "cohort": {
            "experiment_count": len(experiments_out),
            "outcome": outcome,
            "product": product,
            "products": payload.get("products", []),
            "warnings": warnings,
            "cohort_warnings": payload.get("warnings", []),
        },
        "experiments": experiments_out,
    }
    packet["contrasts"] = _ranked_contrasts(experiments_out)
    return packet
```

- [ ] **Step 2: Run evidence tests**

Run:

```bash
cd backend
python manage.py test app.tests.test_analysis_ai_report.AiReportEvidenceTests
```

Expected: both tests pass.

---

### Task 3: Backend AI Generation And Endpoint

**Files:**
- Modify: `backend/app/analysis/ai_report.py`
- Modify: `backend/app/analysis/views.py`
- Modify: `backend/app/analysis/urls.py`
- Modify: `backend/app/tests/test_analysis_ai_report.py`

- [ ] **Step 1: Add failing tests for parsing and endpoint behavior**

Append to `backend/app/tests/test_analysis_ai_report.py`:

```python
class AiReportParsingTests(TestCase):
    def test_parse_ai_report_response_rejects_malformed_json(self):
        from app.analysis.ai_report import AiReportError, parse_ai_report_response

        with self.assertRaises(AiReportError):
            parse_ai_report_response("not json")

    def test_parse_ai_report_response_requires_report_sections(self):
        from app.analysis.ai_report import AiReportError, parse_ai_report_response

        with self.assertRaises(AiReportError):
            parse_ai_report_response(json.dumps({"executive_summary": "Only one field"}))


class AiReportEndpointTests(TestCase):
    def setUp(self):
        from app.models import (
            ClerkUser, DataCategory, DataPoint, Experiment, Membership,
            Organization, Project,
        )

        self.org = Organization.objects.create(clerk_org_id="org_ai_view", name="AI View")
        self.other_org = Organization.objects.create(
            clerk_org_id="org_ai_other", name="Other",
        )
        self.user = ClerkUser.objects.create(
            clerk_id="u_ai_view", email="view@example.com",
        )
        Membership.objects.create(
            user=self.user, organization=self.org, role="admin",
        )
        self.project = Project.objects.create(organization=self.org, name="P")
        self.other_project = Project.objects.create(
            organization=self.other_org, name="Other P",
        )
        self.exp = Experiment.objects.create(title="Ferm AI View", project=self.project)
        self.other_exp = Experiment.objects.create(
            title="Secret AI View", project=self.other_project,
        )
        cat = DataCategory.objects.create(
            project=self.project, category="product", name="CBDa",
            unit="mg/L", role="other",
        )
        DataPoint.objects.create(
            experiment=self.exp, data_category=cat,
            category="product", name="CBDa", value=1,
            timepoint=48, time_unit="hours", data_type="continuous",
            unit="mg/L",
        )

    def _view(self):
        from app.analysis.views import AiReportView
        return AiReportView.as_view()

    @override_settings(OPENAI_API_KEY="")
    def test_missing_api_key_returns_503(self):
        request = _post(
            self.user, self.org, "/api/analysis/ai-report/",
            _ai_body([self.exp.id]),
        )

        response = self._view()(request)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "ai_not_configured")

    def test_cross_org_returns_404(self):
        request = _post(
            self.user, self.org, "/api/analysis/ai-report/",
            _ai_body([self.exp.id, self.other_exp.id]),
        )

        response = self._view()(request)

        self.assertEqual(response.status_code, 404)

    @override_settings(OPENAI_API_KEY="test-key")
    @patch("app.analysis.ai_report.generate_ai_report")
    def test_happy_path_returns_ai_report(self, mock_generate):
        mock_generate.return_value = {
            "executive_summary": "CBDa improved in the clean run.",
            "key_findings": [],
            "hypotheses": [],
            "recommended_experiments": [],
            "caveats": [],
            "evidence_summary": {
                "experiment_count": 1,
                "outcome": "final_titer",
                "product": "CBDa",
                "warnings": [],
            },
        }
        request = _post(
            self.user, self.org, "/api/analysis/ai-report/",
            _ai_body([self.exp.id]),
        )

        response = self._view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["executive_summary"], "CBDa improved in the clean run.")
        evidence = mock_generate.call_args.args[0]
        self.assertEqual(evidence["cohort"]["experiment_count"], 1)

    @override_settings(OPENAI_API_KEY="test-key")
    @patch("app.analysis.ai_report.generate_ai_report")
    def test_ai_generation_error_returns_502(self, mock_generate):
        from app.analysis.ai_report import AiReportError

        mock_generate.side_effect = AiReportError("bad json")
        request = _post(
            self.user, self.org, "/api/analysis/ai-report/",
            _ai_body([self.exp.id]),
        )

        response = self._view()(request)

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["code"], "ai_report_failed")
```

- [ ] **Step 2: Run tests to verify endpoint tests fail**

Run:

```bash
cd backend
python manage.py test app.tests.test_analysis_ai_report
```

Expected: fails because `parse_ai_report_response`, `generate_ai_report`, and `AiReportView` are not implemented.

- [ ] **Step 3: Implement parsing and OpenAI generation**

Append to `backend/app/analysis/ai_report.py`:

```python
REQUIRED_REPORT_KEYS = {
    "executive_summary",
    "key_findings",
    "hypotheses",
    "recommended_experiments",
    "caveats",
    "evidence_summary",
}


def _system_prompt() -> str:
    return (
        "You are an expert fermentation scientist generating an AI analysis "
        "for a selected cohort of precision fermentation experiments. Use only "
        "observed values present in the evidence packet. Separate data-backed "
        "findings from speculative ideas. Creative next-step experiments are "
        "allowed, but uncertainty must be explicit."
    )


def _user_prompt(evidence_packet: dict[str, Any]) -> str:
    return (
        "Return only valid JSON with these top-level keys: "
        "executive_summary, key_findings, hypotheses, recommended_experiments, "
        "caveats, evidence_summary. Recommended experiments must include title, "
        "experiment_type, objective, rationale, variables_to_change, controls, "
        "key_readouts, expected_outcome, and risk. Evidence must cite selected "
        "experiment titles, variables, notes, events, anomalies, or outcome names.\n\n"
        "Evidence packet:\n"
        + json.dumps(evidence_packet, ensure_ascii=True, sort_keys=True)
    )


def parse_ai_report_response(response_text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise AiReportError("AI response was not valid JSON") from exc
    if not isinstance(parsed, dict):
        raise AiReportError("AI response JSON must be an object")
    missing = REQUIRED_REPORT_KEYS - set(parsed)
    if missing:
        raise AiReportError(f"AI response missing keys: {', '.join(sorted(missing))}")
    return parsed


def generate_ai_report(evidence_packet: dict[str, Any]) -> dict[str, Any]:
    from openai import OpenAI

    client = OpenAI(api_key=django_settings.OPENAI_API_KEY)
    try:
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=4096,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _system_prompt()},
                {"role": "user", "content": _user_prompt(evidence_packet)},
            ],
        )
        content = completion.choices[0].message.content or ""
    except Exception as exc:
        raise AiReportError(f"AI generation failed: {exc}") from exc
    return parse_ai_report_response(content)
```

- [ ] **Step 4: Add `AiReportView`**

Modify `backend/app/analysis/views.py` imports:

```python
from app.analysis.ai_report import (
    AiReportError,
    build_ai_evidence_packet,
    generate_ai_report,
)
```

Add this class after `CohortView`:

```python
class AiReportView(APIView):
    permission_classes = [IsAuthenticated, IsOrgMember]

    def post(self, request):
        ids, outcome, product, org, err = _validate_cohort_request(request)
        if err is not None:
            return err
        from django.conf import settings as dj_settings

        if not getattr(dj_settings, "OPENAI_API_KEY", ""):
            return Response(
                {
                    "code": "ai_not_configured",
                    "message": "AI analysis is not configured",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        evidence_packet = build_ai_evidence_packet(
            ids, org, outcome=outcome, product=product,
        )
        try:
            report = generate_ai_report(evidence_packet)
        except AiReportError as exc:
            return Response(
                {"code": "ai_report_failed", "message": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(report, status=status.HTTP_200_OK)
```

- [ ] **Step 5: Add route**

Modify `backend/app/analysis/urls.py`:

```python
from app.analysis.views import (
    AiReportView, AnovaView, CohortView, MainEffectsView, ParetoView, PcaView,
    RegressionPredictView, RegressionView, ResponseSurfaceView,
)

urlpatterns = [
    path("cohort/", CohortView.as_view(), name="analysis-cohort"),
    path("ai-report/", AiReportView.as_view(), name="analysis-ai-report"),
    path("anova/", AnovaView.as_view(), name="analysis-anova"),
    path("main-effects/", MainEffectsView.as_view(), name="analysis-main-effects"),
    path("pareto/", ParetoView.as_view(), name="analysis-pareto"),
    path("regression/", RegressionView.as_view(), name="analysis-regression"),
    path("regression/predict/", RegressionPredictView.as_view(),
         name="analysis-regression-predict"),
    path("response-surface/", ResponseSurfaceView.as_view(),
         name="analysis-response-surface"),
    path("pca/", PcaView.as_view(), name="analysis-pca"),
]
```

- [ ] **Step 6: Run backend AI tests**

Run:

```bash
cd backend
python manage.py test app.tests.test_analysis_ai_report
```

Expected: all AI report tests pass.

- [ ] **Step 7: Commit backend changes**

Run:

```bash
cd backend
git add app/analysis/ai_report.py app/analysis/views.py app/analysis/urls.py app/tests/test_analysis_ai_report.py
git commit -m "feat(analysis): add ai report endpoint"
```

---

### Task 4: Frontend Types, API, And Markdown Helper

**Files:**
- Modify: `frontend/src/lib/analysis/types.ts`
- Modify: `frontend/src/lib/analysis/constants.ts`
- Modify: `frontend/src/lib/analysis/api.ts`
- Create: `frontend/src/lib/analysis/aiReportMarkdown.ts`
- Create: `frontend/src/lib/analysis/aiReportMarkdown.test.ts`

- [ ] **Step 1: Write failing markdown helper test**

Create `frontend/src/lib/analysis/aiReportMarkdown.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AiReport } from './types'
import { aiReportToMarkdown } from './aiReportMarkdown'

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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
node --test --experimental-strip-types src/lib/analysis/aiReportMarkdown.test.ts
```

Expected: fails because `aiReportMarkdown.ts` does not exist.

- [ ] **Step 3: Add AI types and navigation constants**

Modify `frontend/src/lib/analysis/types.ts`:

```ts
export type AnalysisSlug =
  | 'cohort-overview'
  | 'ai-report'
  | 'kinetic-analysis' | 'carbon-flux'
  | 'anova-heatmap' | 'main-effects' | 'response-surface'
  | 'regression'
  | 'strain-lineage' | 'carbon-balance' | 'carbon-consumption'
  | 'yield-summary' | 'media-scan'
  | 'pca' | 'cohort-diff' | 'percentile-overlay'

export type ThemeId = 'cohort' | 'ai' | 'kinetics' | 'doe' | 'metabolic' | 'pattern'
```

Append AI report interfaces after `CohortPayload`:

```ts
export interface AiReportFinding {
  title: string
  explanation: string
  evidence: string[]
  confidence: 'low' | 'medium' | 'high'
}

export interface AiReportHypothesis {
  title: string
  rationale: string
  supporting_evidence: string[]
  uncertainty: string
  confidence: number
  speculative: boolean
}

export type AiReportExperimentType =
  | 'strain_engineering' | 'media' | 'process' | 'control'
  | 'analytics' | 'validation' | 'other'

export interface AiReportRecommendedExperiment {
  title: string
  experiment_type: AiReportExperimentType
  objective: string
  rationale: string
  variables_to_change: string[]
  controls: string[]
  key_readouts: string[]
  expected_outcome: string
  risk: string
}

export interface AiReport {
  executive_summary: string
  key_findings: AiReportFinding[]
  hypotheses: AiReportHypothesis[]
  recommended_experiments: AiReportRecommendedExperiment[]
  caveats: string[]
  evidence_summary: {
    experiment_count: number
    outcome: string
    product: string | null
    warnings: string[]
  }
}
```

Modify `frontend/src/lib/analysis/constants.ts` to add the AI theme after Cohort:

```ts
{ id: 'ai', label: 'AI', analyses: [
  { slug: 'ai-report', label: 'AI', availableInP1: true },
]},
```

- [ ] **Step 4: Add `fetchAiReport`**

Modify imports in `frontend/src/lib/analysis/api.ts`:

```ts
import type {
  AiReport,
  AnovaResult,
  CohortPayload,
  MainEffectsResult,
  OutcomeMetric,
  ParetoResult,
  PcaResult,
  RegressionModelType,
  RegressionPrediction,
  RegressionResult,
  ResponseSurfaceResult,
} from './types'
```

Add:

```ts
export async function fetchAiReport(
  token: string | null,
  experimentIds: number[],
  outcome: OutcomeMetric,
  product: string | null,
): Promise<AiReport> {
  return postAnalysis<AiReport>(token, 'ai-report/', {
    experiment_ids: experimentIds,
    outcome,
    product,
  })
}
```

- [ ] **Step 5: Implement Markdown helper**

Create `frontend/src/lib/analysis/aiReportMarkdown.ts`:

```ts
import type { AiReport } from './types'

function list(items: string[]): string {
  return items.length ? items.map(item => `- ${item}`).join('\n') : '- None listed'
}

export function aiReportToMarkdown(report: AiReport): string {
  const lines: string[] = []
  lines.push('# AI Analysis Report')
  lines.push('')
  lines.push(`Experiments: ${report.evidence_summary.experiment_count}`)
  lines.push(`Outcome: ${report.evidence_summary.outcome}`)
  lines.push(`Product: ${report.evidence_summary.product ?? 'n/a'}`)
  if (report.evidence_summary.warnings.length) {
    lines.push(`Warnings: ${report.evidence_summary.warnings.join(', ')}`)
  }
  lines.push('')
  lines.push('## Executive Summary')
  lines.push('')
  lines.push(report.executive_summary)
  lines.push('')
  lines.push('## Key Findings')
  lines.push('')
  for (const finding of report.key_findings) {
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
  for (const hypothesis of report.hypotheses) {
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
  for (const exp of report.recommended_experiments) {
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
  lines.push(list(report.caveats))
  lines.push('')
  return lines.join('\n')
}
```

- [ ] **Step 6: Run frontend helper test**

Run:

```bash
cd frontend
node --test --experimental-strip-types src/lib/analysis/aiReportMarkdown.test.ts
```

Expected: test passes.

- [ ] **Step 7: Commit frontend type/API/helper changes**

Run:

```bash
cd frontend
git add src/lib/analysis/types.ts src/lib/analysis/constants.ts src/lib/analysis/api.ts src/lib/analysis/aiReportMarkdown.ts src/lib/analysis/aiReportMarkdown.test.ts
git commit -m "feat(analysis): add ai report client types"
```

---

### Task 5: Frontend AI Report UI

**Files:**
- Create: `frontend/src/components/dashboard/analysis/AiReport.tsx`
- Modify: `frontend/src/app/dashboard/analysis/page.tsx`

- [ ] **Step 1: Add AI report component**

Create `frontend/src/components/dashboard/analysis/AiReport.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Download, Sparkles, Clipboard } from 'lucide-react'
import { fetchAiReport } from '@/lib/analysis/api'
import { OUTCOME_METRICS } from '@/lib/analysis/constants'
import { aiReportToMarkdown } from '@/lib/analysis/aiReportMarkdown'
import type { AiReport as AiReportType, CohortPayload, OutcomeMetric } from '@/lib/analysis/types'

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
      setReport(next)
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
              {ids.length} experiments selected · {metric?.label ?? outcome}
              {product ? ` · ${product}` : ''}
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
              {loading ? 'Generating analysis' : 'Generate analysis'}
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
          · {report.evidence_summary.outcome}
          {report.evidence_summary.product ? ` · ${report.evidence_summary.product}` : ''}
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
              <p className="text-xs text-gray-500 mt-2">Uncertainty: {hypothesis.uncertainty}</p>
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
```

- [ ] **Step 2: Wire component into analysis page**

Modify `frontend/src/app/dashboard/analysis/page.tsx`:

```tsx
import { AiReport } from '@/components/dashboard/analysis/AiReport'
```

Add `'ai-report'` to the `OutcomePicker` analysis list:

```tsx
[
  'ai-report',
  'anova-heatmap', 'main-effects', 'regression',
  'response-surface', 'media-scan', 'pca',
  'strain-lineage', 'cohort-diff',
].includes(state.analysis)
```

Add render branch inside the `payload` block:

```tsx
{state.analysis === 'ai-report' && (
  <AiReport
    ids={state.ids}
    outcome={state.outcome}
    product={state.product}
    payload={payload}
  />
)}
```

- [ ] **Step 3: Run lint/build**

Run:

```bash
cd frontend
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 4: Commit frontend UI changes**

Run:

```bash
cd frontend
git add src/components/dashboard/analysis/AiReport.tsx src/app/dashboard/analysis/page.tsx
git commit -m "feat(analysis): add ai report tab"
```

---

### Task 6: Full Verification

**Files:** no new files unless fixing failures.

- [ ] **Step 1: Run backend AI tests**

Run:

```bash
cd backend
python manage.py test app.tests.test_analysis_ai_report
```

Expected: all tests pass.

- [ ] **Step 2: Run backend analysis tests**

Run:

```bash
cd backend
python manage.py test app.tests.test_analysis_views app.tests.test_analysis_math app.tests.test_cohort_outcomes app.tests.test_outcomes_cache
```

Expected: all tests pass.

- [ ] **Step 3: Run frontend helper test**

Run:

```bash
cd frontend
node --test --experimental-strip-types src/lib/analysis/aiReportMarkdown.test.ts
```

Expected: test passes.

- [ ] **Step 4: Run frontend lint/build**

Run:

```bash
cd frontend
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 5: Inspect final git status**

Run:

```bash
cd backend
git status --short
cd ../frontend
git status --short
```

Expected: only pre-existing unrelated user changes remain uncommitted, plus any intentional commits from this plan.
