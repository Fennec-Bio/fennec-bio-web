# Analysis Cohort Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a leftmost top-level "Cohort" theme tab to the analysis section that renders an expanded two-column cohort builder (filtered candidates on the left, current cohort on the right) with click-to-toggle, per-column search, filter-variable tags, and auto-drop when filters narrow.

**Architecture:** Frontend-heavy. New `CohortOverview` and `ExperimentRow` components in the analysis area, a shared `useCandidateExperiments` hook extracted from `CohortRail`, and one additive backend change — an opt-in `?include=variables` query param on `/api/experimentList/` so candidate rows can render variable tags. The 280px sidebar (`CohortRail`) stays mounted but conditionally hides its own candidates list when the cohort overview is active.

**Tech Stack:** Django 5.1 + DRF (backend), Next.js 16 App Router + TypeScript + Tailwind v4 + `@tanstack/react-virtual` (frontend). Frontend has no test runner — verification is `npm run lint`, `npm run build`, plus manual browser checks. Backend uses `python manage.py test app.tests`.

**Repo layout reminder:** This is a dual-repo project. `backend/` and `frontend/` are independent git repos. There is **no** parent repo at `Desktop/Fennec Bio/`. `cd` into the right subdirectory before running git, npm, or python commands.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `backend/app/serializers.py` | Modify | Add `ExperimentListWithVariablesSerializer` subclass that includes `variables`. |
| `backend/app/views.py` | Modify | In `experiment_list`, branch on `?include=variables` to swap serializer + add `prefetch_related('variables')`. |
| `backend/app/tests/test_views.py` | Modify | Add three tests: include works, default omits, org isolation holds. |
| `frontend/src/lib/analysis/types.ts` | Modify | Extend `ThemeId` with `'cohort'`, `AnalysisSlug` with `'cohort-overview'`. |
| `frontend/src/lib/analysis/constants.ts` | Modify | Prepend Cohort theme; flip `DEFAULT_THEME` and `DEFAULT_ANALYSIS`. |
| `frontend/src/lib/analysis/api.ts` | Modify | Add `includeVariables?: boolean` param + optional `variables` field on response row type. |
| `frontend/src/hooks/useCandidateExperiments.ts` | Create | Shared hook encapsulating the debounced candidate fetch. |
| `frontend/src/components/dashboard/analysis/ExperimentRow.tsx` | Create | Single row renderer used by both columns. |
| `frontend/src/components/dashboard/analysis/CohortOverview.tsx` | Create | Two-column main-area component with search, virtualization, auto-drop. |
| `frontend/src/components/dashboard/analysis/CohortRail.tsx` | Modify | Use the shared hook; hide candidates section when on cohort-overview. |
| `frontend/src/app/dashboard/analysis/page.tsx` | Modify | Render `<CohortOverview />` for the new analysis; gate the "pick experiments" hint. |

---

## Task 1: Backend — opt-in `?include=variables` on experiment list

**Files:**
- Modify: `backend/app/serializers.py` (after the existing `ExperimentSerializer` block)
- Modify: `backend/app/views.py` (the `experiment_list` function)
- Test: `backend/app/tests/test_views.py` (add three tests inside the existing `ExperimentListTest` class and one inside `CrossOrgIsolationTest`)

- [ ] **Step 1.1: Write the three failing tests**

Open `backend/app/tests/test_views.py`. Inside `class ExperimentListTest(TestCase)`, append these two tests after the last existing test method:

```python
    def test_experiment_list_includes_variables_when_requested(self):
        exp = Experiment.objects.create(title="Exp V", project=self.project)
        Variable.objects.create(experiment=exp, name="pulse size", value="40")
        Variable.objects.create(experiment=exp, name="feed rate", value="0.2")
        request = self._auth_request("get", "/api/experimentList/?include=variables")
        response = experiment_list(request)
        self.assertEqual(response.status_code, 200)
        rows = response.data["experiments"]["experiments"]
        row = next(r for r in rows if r["title"] == "Exp V")
        self.assertIn("variables", row)
        pairs = {(v["name"], v["value"]) for v in row["variables"]}
        self.assertSetEqual(pairs, {("pulse size", "40"), ("feed rate", "0.2")})

    def test_experiment_list_omits_variables_by_default(self):
        exp = Experiment.objects.create(title="Exp NoVars", project=self.project)
        Variable.objects.create(experiment=exp, name="pulse size", value="40")
        request = self._auth_request("get", "/api/experimentList/")
        response = experiment_list(request)
        self.assertEqual(response.status_code, 200)
        rows = response.data["experiments"]["experiments"]
        row = next(r for r in rows if r["title"] == "Exp NoVars")
        self.assertNotIn("variables", row)
```

Inside `class CrossOrgIsolationTest(TestCase)`, append this test after the last method:

```python
    def test_experiment_list_variables_scoped_to_org(self):
        Variable.objects.create(experiment=self.exp_a, name="pulse size", value="40")
        Variable.objects.create(experiment=self.exp_b, name="secret", value="hidden")
        request = self._auth_request(self.user_a, self.org_a, "get", "/api/experimentList/?include=variables")
        response = experiment_list(request)
        rows = response.data["experiments"]["experiments"]
        for row in rows:
            for v in row.get("variables", []):
                self.assertNotEqual(v["name"], "secret")
                self.assertNotEqual(v["value"], "hidden")
        titles = {r["title"] for r in rows}
        self.assertIn("Ferm A-1", titles)
        self.assertNotIn("Ferm B-1", titles)
```

- [ ] **Step 1.2: Run the new tests to verify they fail**

Run from `backend/`:

```bash
cd backend
python manage.py test app.tests.test_views.ExperimentListTest.test_experiment_list_includes_variables_when_requested app.tests.test_views.ExperimentListTest.test_experiment_list_omits_variables_by_default app.tests.test_views.CrossOrgIsolationTest.test_experiment_list_variables_scoped_to_org -v 2
```

Expected: `test_experiment_list_includes_variables_when_requested` FAILS because the row has no `variables` key. The other two should currently pass (default behavior already omits, and Org A's experiments don't yet have `variables` in the response so the loop is vacuously true). The first failure is sufficient confirmation that the test catches the missing feature.

- [ ] **Step 1.3: Add the new serializer**

Open `backend/app/serializers.py`. Locate `class ExperimentSerializer(serializers.ModelSerializer):` (around line 29). Immediately after that class (before `class ExperimentNoteImageSerializer`), insert:

```python
class ExperimentListWithVariablesSerializer(ExperimentSerializer):
    variables = VariableSerializer(many=True, read_only=True)

    class Meta(ExperimentSerializer.Meta):
        fields = ExperimentSerializer.Meta.fields + ["variables"]
        read_only_fields = fields
```

Note: `VariableSerializer` is defined later in the file (around line 74). Python class definitions are read top-to-bottom but only the **method bodies** execute at call time, so a forward reference inside `Meta` would fail — but here `VariableSerializer(...)` is evaluated at class body time of `ExperimentListWithVariablesSerializer`. Therefore: place the new class **after** `VariableSerializer` is defined. Move it to immediately after `class VariableSerializer(...)` (around line 78) instead. The exact insertion point is right after the `VariableSerializer` class block.

- [ ] **Step 1.4: Wire the include flag into the view**

Open `backend/app/views.py`. Two changes inside `experiment_list`:

**Change 1** — locate the queryset-construction line:

```python
    qs = Experiment.objects.select_related('project').filter(project__organization=org)
```

Replace it with these three lines (parse `include` first, then conditionally prefetch):

```python
    include = (request.GET.get("include") or "").split(",")
    qs = Experiment.objects.select_related('project').filter(project__organization=org)
    if "variables" in include:
        qs = qs.prefetch_related("variables")
```

**Change 2** — locate the line near the end of the function that reads:

```python
    serializer = ExperimentSerializer(page.object_list, many=True)
```

Replace it with:

```python
    if "variables" in include:
        serializer = ExperimentListWithVariablesSerializer(page.object_list, many=True)
    else:
        serializer = ExperimentSerializer(page.object_list, many=True)
```

**Change 3** — add `ExperimentListWithVariablesSerializer` to the imports at the top of `views.py`. Find the existing `from app.serializers import ...` line and add `ExperimentListWithVariablesSerializer` to its imported names.

- [ ] **Step 1.5: Run the new tests to verify they pass**

```bash
python manage.py test app.tests.test_views.ExperimentListTest.test_experiment_list_includes_variables_when_requested app.tests.test_views.ExperimentListTest.test_experiment_list_omits_variables_by_default app.tests.test_views.CrossOrgIsolationTest.test_experiment_list_variables_scoped_to_org -v 2
```

Expected: all three PASS.

- [ ] **Step 1.6: Run the full test suite to confirm nothing regressed**

```bash
python manage.py test app.tests
```

Expected: all tests pass, no new failures.

- [ ] **Step 1.7: Commit**

```bash
cd backend
git add app/serializers.py app/views.py app/tests/test_views.py
git commit -m "feat(api): opt-in ?include=variables on experimentList"
```

---

## Task 2: Frontend — type unions and constants

**Files:**
- Modify: `frontend/src/lib/analysis/types.ts`
- Modify: `frontend/src/lib/analysis/constants.ts`

- [ ] **Step 2.1: Extend the type unions**

Open `frontend/src/lib/analysis/types.ts`. Replace the existing `AnalysisSlug` and `ThemeId` declarations (lines 5–12) with:

```ts
export type AnalysisSlug =
  | 'cohort-overview'
  | 'kinetic-analysis'
  | 'anova-heatmap' | 'main-effects' | 'response-surface'
  | 'pareto' | 'regression'
  | 'strain-lineage' | 'carbon-balance' | 'yield-summary' | 'media-scan'
  | 'pca' | 'cohort-diff' | 'percentile-overlay'

export type ThemeId = 'cohort' | 'kinetics' | 'doe' | 'metabolic' | 'pattern'
```

- [ ] **Step 2.2: Prepend the Cohort theme and flip defaults**

Open `frontend/src/lib/analysis/constants.ts`. Replace the entire `THEMES` array and the `DEFAULT_*` exports with:

```ts
export const THEMES: Array<{
  id: ThemeId
  label: string
  analyses: Array<{ slug: AnalysisSlug; label: string; availableInP1: boolean }>
}> = [
  { id: 'cohort', label: 'Cohort', analyses: [
    { slug: 'cohort-overview', label: 'Cohort', availableInP1: true },
  ]},
  { id: 'kinetics', label: 'Kinetics', analyses: [
    { slug: 'kinetic-analysis', label: 'Kinetic Analysis', availableInP1: true },
  ]},
  { id: 'doe', label: 'Variable impact & DoE', analyses: [
    { slug: 'anova-heatmap',    label: 'ANOVA heatmap',     availableInP1: true  },
    { slug: 'main-effects',     label: 'Main effects',      availableInP1: true  },
    { slug: 'response-surface', label: 'Response surface',  availableInP1: true  },
    { slug: 'pareto',           label: 'Pareto',            availableInP1: true  },
    { slug: 'regression',       label: 'Regression',        availableInP1: true  },
  ]},
  { id: 'metabolic', label: 'Metabolic eng.', analyses: [
    { slug: 'strain-lineage', label: 'Strain lineage',       availableInP1: true  },
    { slug: 'carbon-balance', label: 'Carbon balance',       availableInP1: true  },
    { slug: 'yield-summary',  label: 'Yield summary',        availableInP1: true  },
    { slug: 'media-scan',     label: 'Media component scan', availableInP1: true  },
  ]},
  { id: 'pattern', label: 'Pattern finding', analyses: [
    { slug: 'percentile-overlay', label: 'Percentile overlay',  availableInP1: true },
    { slug: 'pca',                label: 'PCA biplot',          availableInP1: true },
    { slug: 'cohort-diff',        label: 'Best-vs-worst diff',  availableInP1: true },
  ]},
]

export const DEFAULT_THEME: ThemeId = 'cohort'
export const DEFAULT_ANALYSIS: AnalysisSlug = 'cohort-overview'
```

- [ ] **Step 2.3: Verify typecheck still compiles**

```bash
cd frontend
npx tsc --noEmit
```

Expected: pass (no type errors in unrelated files; the new slug isn't referenced yet so this only validates the union itself).

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/constants.ts
git commit -m "feat(analysis): register cohort theme and cohort-overview slug"
```

---

## Task 3: Frontend — extend `fetchCandidateExperiments` with `includeVariables`

**Files:**
- Modify: `frontend/src/lib/analysis/api.ts`

- [ ] **Step 3.1: Add `includeVariables` to params and response shape**

Open `frontend/src/lib/analysis/api.ts`. Replace the `ExperimentListParams` interface (lines 36–45) with:

```ts
export interface ExperimentListParams {
  strainIds?: number[]
  parentStrainIds?: number[]
  batchMediaIds?: number[]
  feedMediaIds?: number[]
  variableFilters?: Array<{ name: string; values: string[] }>
  page?: number
  pageSize?: number
  projectId?: number | null
  includeVariables?: boolean
}
```

Replace the `fetchCandidateExperiments` function (lines 47–80) with:

```ts
export async function fetchCandidateExperiments(
  token: string | null,
  params: ExperimentListParams,
): Promise<{
  experiments: Array<{
    id: number
    title: string
    description: string
    strain?: string | null
    variables?: Array<{ name: string; value: string }>
  }>
  total: number
  page: number
  totalPages: number
}> {
  const qs = new URLSearchParams()
  if (params.strainIds?.length)        qs.set('strain__in',        params.strainIds.join(','))
  if (params.parentStrainIds?.length)  qs.set('parent_strain__in', params.parentStrainIds.join(','))
  if (params.batchMediaIds?.length)    qs.set('batch_media__in',   params.batchMediaIds.join(','))
  if (params.feedMediaIds?.length)     qs.set('feed_media__in',    params.feedMediaIds.join(','))
  for (const f of params.variableFilters ?? []) {
    if (f.values.length) qs.set(`variable_${f.name}`, f.values.join(','))
  }
  if (params.page)                     qs.set('page',              String(params.page))
  if (params.pageSize)                 qs.set('page_size',         String(params.pageSize))
  if (params.projectId)                qs.set('project_id',        String(params.projectId))
  if (params.includeVariables)         qs.set('include',           'variables')
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/experimentList/?${qs.toString()}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  )
  if (!res.ok) throw new Error(`experimentList fetch failed: ${res.status}`)
  const body = await res.json()
  const wrap = body.experiments
  return {
    experiments: wrap.experiments,
    total: wrap.total_experiments,
    page: wrap.current_page,
    totalPages: wrap.total_pages,
  }
}
```

Note: the `strain` field on the row was already implicitly returned by `ExperimentSerializer`; the existing `CohortRail` casts to read it. Adding it to the explicit return type makes downstream consumers type-safe without a cast.

- [ ] **Step 3.2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: pass. The `CohortRail.tsx` cast `((e as unknown) as { strain?: string | null })` is now redundant but still type-safe — it'll be removed in Task 4.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/analysis/api.ts
git commit -m "feat(analysis): add includeVariables to fetchCandidateExperiments"
```

---

## Task 4: Frontend — extract `useCandidateExperiments` hook

**Files:**
- Create: `frontend/src/hooks/useCandidateExperiments.ts`
- Modify: `frontend/src/components/dashboard/analysis/CohortRail.tsx`

- [ ] **Step 4.1: Create the hook**

Create `frontend/src/hooks/useCandidateExperiments.ts` with:

```ts
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchCandidateExperiments } from '@/lib/analysis/api'

export interface Candidate {
  id: number
  title: string
  strain_name: string | null
  variables?: Array<{ name: string; value: string }>
}

export interface UseCandidateArgs {
  strainIds: number[]
  parentStrainIds: number[]
  batchMediaIds: number[]
  feedMediaIds: number[]
  variableFilters: Array<{ name: string; values: string[] }>
  includeVariables?: boolean
}

export function useCandidateExperiments(args: UseCandidateArgs): {
  candidates: Candidate[]
  loading: boolean
} {
  const { getToken } = useAuth()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)

  const variableFiltersKey = useMemo(
    () => args.variableFilters
      .filter(f => f.values.length)
      .map(f => `${f.name}=${[...f.values].sort().join(',')}`)
      .sort()
      .join(';'),
    [args.variableFilters],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const h = setTimeout(async () => {
      try {
        const token = await getToken()
        const body = await fetchCandidateExperiments(token, {
          strainIds: args.strainIds,
          parentStrainIds: args.parentStrainIds,
          batchMediaIds: args.batchMediaIds,
          feedMediaIds: args.feedMediaIds,
          variableFilters: args.variableFilters,
          pageSize: 5000,
          includeVariables: args.includeVariables,
        })
        if (!cancelled) {
          setCandidates(body.experiments.map(e => ({
            id: e.id,
            title: e.title,
            strain_name: e.strain ?? null,
            variables: e.variables,
          })))
        }
      } catch (err) {
        console.error('Failed to load candidates', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(h) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    getToken,
    args.strainIds,
    args.parentStrainIds,
    args.batchMediaIds,
    args.feedMediaIds,
    variableFiltersKey,
    args.includeVariables,
  ])

  return { candidates, loading }
}
```

- [ ] **Step 4.2: Refactor `CohortRail` to use the hook (no behavior change)**

Open `frontend/src/components/dashboard/analysis/CohortRail.tsx`. Make these edits:

**Edit A** — Update imports (top of file). Remove the `fetchCandidateExperiments` import and add the hook:

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { useCohortPayload } from '@/hooks/useCohortPayload'
import { useCandidateExperiments } from '@/hooks/useCandidateExperiments'
import {
  fetchUniqueNames,
  type UniqueNamesResponse,
} from '@/lib/analysis/api'
import { OutcomePicker } from './OutcomePicker'
import { VariableFilter } from './VariableFilter'
```

**Edit B** — Remove the local `Candidate` interface (lines 16–20).

**Edit C** — In the `CohortRail` function body, remove these lines (currently lines 103–104, 124–172):

```ts
const [candidates, setCandidates] = useState<Candidate[]>([])
const [loadingCandidates, setLoadingCandidates] = useState(false)
```

…and the entire `useEffect` that fetches candidates including its `variableFiltersKey` `useMemo`.

Replace them with a single hook call placed right after `const [unique, setUnique] = useState<UniqueNamesResponse | null>(null)`:

```ts
const { candidates, loading: loadingCandidates } = useCandidateExperiments({
  strainIds:       state.strainIds,
  parentStrainIds: state.parentStrainIds,
  batchMediaIds:   state.batchMediaIds,
  feedMediaIds:    state.feedMediaIds,
  variableFilters: state.variableFilters,
})
```

The rest of the component (virtualizer, render, etc.) is unchanged.

- [ ] **Step 4.3: Run lint + typecheck**

```bash
cd frontend
npm run lint
npx tsc --noEmit
```

Expected: pass. Any unused-import warnings on the removed `fetchCandidateExperiments` import should be gone after Edit A.

- [ ] **Step 4.4: Build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4.5: Manual smoke test**

Run the dev server (`npm run dev`) and navigate to `/dashboard/analysis`. Verify:

1. The Kinetics theme is the default landing tab (Task 2 changed defaults but the new theme has no view yet — for now you'll land on Cohort with no main-area renderer; switch to Kinetics manually).
2. Filters in the sidebar still populate the candidates list as before.
3. Selecting/deselecting candidates still works.

Stop the dev server.

- [ ] **Step 4.6: Commit**

```bash
git add src/hooks/useCandidateExperiments.ts src/components/dashboard/analysis/CohortRail.tsx
git commit -m "refactor(analysis): extract useCandidateExperiments hook"
```

---

## Task 5: Frontend — `ExperimentRow` component

**Files:**
- Create: `frontend/src/components/dashboard/analysis/ExperimentRow.tsx`

- [ ] **Step 5.1: Create the component**

Create `frontend/src/components/dashboard/analysis/ExperimentRow.tsx` with:

```tsx
'use client'

interface Variable {
  name: string
  value: string
}

interface ExperimentRowProps {
  experiment: {
    id: number
    title: string
    strain_name: string | null
    variables?: Variable[]
  }
  inCohort: boolean
  activeFilterVariableNames: string[]
  variant: 'candidate' | 'cohort'
  onClick: () => void
}

export function ExperimentRow({
  experiment,
  inCohort,
  activeFilterVariableNames,
  variant,
  onClick,
}: ExperimentRowProps) {
  const greyed = variant === 'candidate' && inCohort

  const tagVariables: Variable[] =
    activeFilterVariableNames.length === 0 || !experiment.variables
      ? []
      : experiment.variables.filter(v => activeFilterVariableNames.includes(v.name))

  return (
    <div
      onClick={onClick}
      className={[
        'px-3 py-2 flex items-center gap-2 text-sm border-b border-gray-100 cursor-pointer',
        greyed ? 'bg-gray-100 text-gray-600' : 'hover:bg-gray-50',
      ].join(' ')}
    >
      {variant === 'candidate' && (
        <input type="checkbox" readOnly checked={inCohort} />
      )}
      <span className="truncate flex-1">{experiment.title}</span>
      {tagVariables.map(v => (
        <span
          key={v.name}
          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 whitespace-nowrap"
        >
          {v.name}: {v.value}
        </span>
      ))}
      <span className="text-xs text-gray-400 truncate max-w-[100px]">
        {experiment.strain_name ?? '—'}
      </span>
      {variant === 'cohort' && (
        <span
          className="text-gray-400 hover:text-gray-700 cursor-pointer text-base leading-none"
          aria-label="Remove from cohort"
        >
          ×
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 5.2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 5.3: Commit**

```bash
git add src/components/dashboard/analysis/ExperimentRow.tsx
git commit -m "feat(analysis): add ExperimentRow component for cohort view"
```

---

## Task 6: Frontend — `CohortOverview` component

**Files:**
- Create: `frontend/src/components/dashboard/analysis/CohortOverview.tsx`

- [ ] **Step 6.1: Create the component**

Create `frontend/src/components/dashboard/analysis/CohortOverview.tsx` with:

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAnalysisState } from '@/hooks/useAnalysisState'
import { useCandidateExperiments, type Candidate } from '@/hooks/useCandidateExperiments'
import { ExperimentRow } from './ExperimentRow'

function matchesSearch(c: Candidate, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  if (c.title.toLowerCase().includes(needle)) return true
  if (c.strain_name && c.strain_name.toLowerCase().includes(needle)) return true
  return false
}

export function CohortOverview() {
  const [state, setState] = useAnalysisState()

  const { candidates, loading } = useCandidateExperiments({
    strainIds:       state.strainIds,
    parentStrainIds: state.parentStrainIds,
    batchMediaIds:   state.batchMediaIds,
    feedMediaIds:    state.feedMediaIds,
    variableFilters: state.variableFilters,
    includeVariables: true,
  })

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => a.title.localeCompare(b.title)),
    [candidates],
  )

  const candidateIdSet = useMemo(
    () => new Set(sortedCandidates.map(c => c.id)),
    [sortedCandidates],
  )

  // Auto-drop: when filters narrow, prune state.ids to those still matching.
  // Skip during loading so an empty in-flight result doesn't wipe the cohort.
  useEffect(() => {
    if (loading) return
    if (state.ids.length === 0) return
    const nextIds = state.ids.filter(id => candidateIdSet.has(id))
    if (nextIds.length !== state.ids.length) {
      setState({ ids: nextIds })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIdSet, loading])

  const selectedSet = useMemo(() => new Set(state.ids), [state.ids])

  const cohortRows = useMemo(
    () => sortedCandidates.filter(c => selectedSet.has(c.id)),
    [sortedCandidates, selectedSet],
  )

  const activeFilterVariableNames = useMemo(
    () => state.variableFilters.filter(f => f.values.length).map(f => f.name),
    [state.variableFilters],
  )

  const [candidateSearch, setCandidateSearch] = useState('')
  const [cohortSearch, setCohortSearch] = useState('')

  const filteredCandidates = useMemo(
    () => sortedCandidates.filter(c => matchesSearch(c, candidateSearch)),
    [sortedCandidates, candidateSearch],
  )

  const filteredCohort = useMemo(
    () => cohortRows.filter(c => matchesSearch(c, cohortSearch)),
    [cohortRows, cohortSearch],
  )

  const toggle = (id: number) => {
    const next = selectedSet.has(id)
      ? state.ids.filter(x => x !== id)
      : [...state.ids, id]
    setState({ ids: next })
  }

  const selectAll = () => setState({ ids: sortedCandidates.map(c => c.id) })
  const clearAll  = () => setState({ ids: [] })

  const candidatesScrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filteredCandidates.length,
    getScrollElement: () => candidatesScrollRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  return (
    <div className="grid grid-cols-2 gap-3 h-[calc(100vh-220px)]">
      {/* Candidates column */}
      <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase text-gray-500 font-semibold">
              Candidates ({sortedCandidates.length})
            </h3>
            <div className="flex gap-3 text-xs">
              <button onClick={selectAll} className="text-[#eb5234] hover:underline">All</button>
              <button onClick={clearAll}  className="text-gray-500 hover:underline">None</button>
            </div>
          </div>
          <input
            value={candidateSearch}
            onChange={e => setCandidateSearch(e.target.value)}
            placeholder="Search candidates…"
            className="mt-2 w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div ref={candidatesScrollRef} className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-3 text-sm text-gray-400">Loading candidates…</div>
          )}
          {!loading && filteredCandidates.length === 0 && (
            <div className="p-3 text-sm text-gray-400">
              {sortedCandidates.length === 0
                ? 'No experiments match your filters.'
                : 'No candidates match this search.'}
            </div>
          )}
          {!loading && filteredCandidates.length > 0 && (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(v => {
                const c = filteredCandidates[v.index]
                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      transform: `translateY(${v.start}px)`,
                      height: `${v.size}px`,
                    }}
                  >
                    <ExperimentRow
                      experiment={c}
                      inCohort={selectedSet.has(c.id)}
                      activeFilterVariableNames={activeFilterVariableNames}
                      variant="candidate"
                      onClick={() => toggle(c.id)}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cohort column */}
      <div className="bg-white border border-gray-200 rounded-lg flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase text-gray-500 font-semibold">
              Cohort ({cohortRows.length})
            </h3>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">
              Clear
            </button>
          </div>
          <input
            value={cohortSearch}
            onChange={e => setCohortSearch(e.target.value)}
            placeholder="Search cohort…"
            className="mt-2 w-full border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {cohortRows.length === 0 && (
            <div className="p-3 text-sm text-gray-400">
              Click experiments on the left to add them to your cohort.
            </div>
          )}
          {cohortRows.length > 0 && filteredCohort.length === 0 && (
            <div className="p-3 text-sm text-gray-400">No cohort rows match this search.</div>
          )}
          {filteredCohort.map(c => (
            <ExperimentRow
              key={c.id}
              experiment={c}
              inCohort={true}
              activeFilterVariableNames={activeFilterVariableNames}
              variant="cohort"
              onClick={() => toggle(c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/dashboard/analysis/CohortOverview.tsx
git commit -m "feat(analysis): add CohortOverview two-column view"
```

---

## Task 7: Frontend — wire CohortOverview into the analysis page

**Files:**
- Modify: `frontend/src/app/dashboard/analysis/page.tsx`

- [ ] **Step 7.1: Add the import**

Open `frontend/src/app/dashboard/analysis/page.tsx`. Add this import alongside the other component imports (alphabetical order, after `BestVsWorstDiff`, before `CarbonBalance`):

```ts
import { CohortOverview } from '@/components/dashboard/analysis/CohortOverview'
```

- [ ] **Step 7.2: Render the cohort overview branch + gate the empty hint**

Replace the existing JSX block from `{state.ids.length === 0 && (` through the end of the inner `<div className="mt-6">` (lines 41–100) with:

```tsx
        <div className="mt-6">
          {state.analysis === 'cohort-overview' && (
            <CohortOverview />
          )}
          {state.analysis !== 'cohort-overview' && state.ids.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              Pick experiments on the left to begin.
            </div>
          )}
          {state.analysis !== 'cohort-overview' && state.ids.length > 0 && loading && (
            <div className="text-sm text-gray-500">Loading cohort…</div>
          )}
          {state.analysis !== 'cohort-overview' && state.ids.length > 0 && error && (
            <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 p-3">
              {error}
            </div>
          )}
          {state.analysis !== 'cohort-overview' && payload && (
            <>
              {state.analysis === 'kinetic-analysis' && (
                <KineticAnalysis payload={payload} />
              )}
              {state.analysis === 'anova-heatmap' && (
                <AnovaHeatmap ids={state.ids} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'main-effects' && (
                <MainEffects ids={state.ids} outcome={state.outcome}
                             product={state.product} payload={payload} />
              )}
              {state.analysis === 'pareto' && (
                <Pareto ids={state.ids} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'regression' && (
                <Regression ids={state.ids} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'response-surface' && (
                <ResponseSurface payload={payload} ids={state.ids}
                                 outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'carbon-balance' && (
                <CarbonBalance payload={payload} />
              )}
              {state.analysis === 'media-scan' && (
                <MediaScan payload={payload} outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'pca' && (
                <PCABiplot payload={payload} ids={state.ids}
                           outcome={state.outcome} product={state.product} />
              )}
              {state.analysis === 'percentile-overlay' && (
                <PercentileOverlay payload={payload} />
              )}
              {state.analysis === 'yield-summary' && (
                <YieldSummary payload={payload} product={state.product} />
              )}
              {state.analysis === 'strain-lineage' && (
                <StrainLineage payload={payload} product={state.product} outcome={state.outcome} />
              )}
              {state.analysis === 'cohort-diff' && (
                <BestVsWorstDiff payload={payload} product={state.product} outcome={state.outcome} />
              )}
            </>
          )}
        </div>
```

- [ ] **Step 7.3: Typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both pass.

- [ ] **Step 7.4: Commit**

```bash
git add src/app/dashboard/analysis/page.tsx
git commit -m "feat(analysis): wire CohortOverview into analysis page"
```

---

## Task 8: Frontend — conditionally hide CohortRail's candidates section

**Files:**
- Modify: `frontend/src/components/dashboard/analysis/CohortRail.tsx`

- [ ] **Step 8.1: Wrap the candidates section in a conditional**

Open `frontend/src/components/dashboard/analysis/CohortRail.tsx`. Locate the candidates section in the return JSX. After Task 4's refactor, it begins at the `<div className="mt-3 flex items-center justify-between">` block that contains the "Candidates (...) — N selected" header and continues through the closing `</div>` of the virtualized list (the block ends just before `<OutcomePicker availableProducts={availableProducts} />`).

Wrap that whole region in `{state.analysis !== 'cohort-overview' && (` ... `)}`. The result looks like:

```tsx
      {state.analysis !== 'cohort-overview' && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <h3 className="text-xs uppercase text-gray-400">
              Candidates ({candidates.length}) — {state.ids.length} selected
            </h3>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-[#eb5234] hover:underline">All</button>
              <button onClick={selectNone} className="text-gray-500 hover:underline">None</button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="mt-2 h-[360px] overflow-y-auto border border-gray-200 rounded-md bg-white"
          >
            {loadingCandidates && (
              <div className="p-3 text-sm text-gray-400">Loading candidates…</div>
            )}
            {!loadingCandidates && candidates.length === 0 && (
              <div className="p-3 text-sm text-gray-400">No experiments match</div>
            )}
            {!loadingCandidates && candidates.length > 0 && (
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map(v => {
                  const c = candidates[v.index]
                  const checked = selectedSet.has(c.id)
                  return (
                    <div
                      key={c.id}
                      style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        transform: `translateY(${v.start}px)`,
                        height: `${v.size}px`,
                      }}
                      className="px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                      onClick={() => toggle(c.id)}
                    >
                      <input type="checkbox" readOnly checked={checked} />
                      <span className="truncate flex-1">{c.title}</span>
                      <span className="text-xs text-gray-400 truncate">
                        {c.strain_name ?? '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
      <OutcomePicker availableProducts={availableProducts} />
```

The `<OutcomePicker />` line stays **outside** the conditional so the outcome picker continues to render on every theme.

- [ ] **Step 8.2: Typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both pass.

- [ ] **Step 8.3: Commit**

```bash
git add src/components/dashboard/analysis/CohortRail.tsx
git commit -m "feat(analysis): hide sidebar candidates list on cohort tab"
```

---

## Task 9: Verify end-to-end in the browser

**Files:** none (manual verification only)

- [ ] **Step 9.1: Start the backend**

In a terminal:

```bash
cd backend
python manage.py runserver
```

Leave it running.

- [ ] **Step 9.2: Start the frontend dev server**

In a second terminal:

```bash
cd frontend
npm run dev
```

- [ ] **Step 9.3: Walk through the verification checklist**

Open http://localhost:3000/dashboard/analysis (sign in if prompted). Confirm each item:

1. **Default landing.** With no URL params, the Cohort theme tab is highlighted on the far left of the theme tab row, and the main area shows the two-column Candidates / Cohort view. URL has no `theme=` or `analysis=` params (defaults are stripped).
2. **Sidebar shape.** Sidebar shows: filters, "Load from set", and the outcome picker. Sidebar does **not** show its own candidates list.
3. **Tag rendering.** Open the Variables filter in the sidebar and select at least one value for one variable name (e.g. pick a value under `pulse size`). Each row in both columns now shows a `pulse size: <value>` tag in amber. Clear the filter — tags disappear.
4. **Click-to-toggle.** Click a candidate row. It appears in the cohort column and is shown greyed/checked in the candidates column. Click it again from either column — it leaves the cohort.
5. **All / None / Clear.** "All" puts every candidate into the cohort. "None" or "Clear" empties the cohort.
6. **Search.** Type into the candidates search box — only matching candidates remain visible. The cohort column is unaffected. Type into the cohort search box — only matching cohort rows remain. Clear both.
7. **Auto-drop.** Add several candidates to the cohort. Then narrow the strain filter to exclude some of them. The cohort column shrinks automatically; URL `ids` shrinks correspondingly.
8. **Cross-theme.** Click the Kinetics theme tab. The sidebar candidates list reappears (showing the same set), and the existing kinetic analysis renders with the surviving cohort. The cohort itself is preserved across the navigation.
9. **Empty cohort hint.** With cohort empty, switch back to Cohort theme — the right column shows "Click experiments on the left to add them to your cohort." Switch to a non-cohort theme — the main area shows "Pick experiments on the left to begin."

If any item fails, file a bug or fix in place before proceeding.

- [ ] **Step 9.4: Final lint + build pass**

```bash
cd frontend
npm run lint
npm run build
```

Expected: both pass with no warnings introduced by this change.

- [ ] **Step 9.5: Final backend test pass**

```bash
cd backend
python manage.py test app.tests
```

Expected: all tests pass.

---

## Out of scope (do not implement)

- Drag-and-drop between columns
- Per-row "Add" / "Remove" buttons (clicking the row handles both)
- Sorting other than by title
- Persisting per-column search strings in the URL
- Virtualization of the cohort column
- Showing variables outside the active filter set (no "+more" expander)
- Any change to the data model or to the `CohortPayload` API
