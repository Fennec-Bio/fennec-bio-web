# Analysis Cohort Tab — Design Spec

**Date:** 2026-05-01
**Scope:** Frontend (`frontend/`) primary, plus a small additive change to Backend (`backend/`) to expose variables on the candidate list endpoint
**Status:** Approved, ready for implementation plan

## Summary

Add a new top-level theme tab called **Cohort** to the analysis section, positioned as the leftmost theme (before Kinetics) and set as the default landing tab. It contains a single analysis sub-tab, `cohort-overview`, which renders an expanded two-column view of the existing cohort builder:

- **Left column** — all experiments matching the active filters ("candidates")
- **Right column** — all experiments currently in the cohort (selected)

The existing 280px sidebar (`CohortRail`) stays mounted with its filters, "Load from set" control, and outcome picker, so all selection inputs remain in the same place across themes. The new view simply gives candidates and the cohort dedicated, side-by-side real estate.

## Where it lives

- **New theme:** `cohort` added to `THEMES` in `frontend/src/lib/analysis/constants.ts`, prepended to the array. Label `"Cohort"`. Single analysis: `{ slug: 'cohort-overview', label: 'Cohort', availableInP1: true }`.
- **Type unions:** `frontend/src/lib/analysis/types.ts` — extend `ThemeId` with `'cohort'` and `AnalysisSlug` with `'cohort-overview'`.
- **Defaults:** `DEFAULT_THEME` = `'cohort'`, `DEFAULT_ANALYSIS` = `'cohort-overview'`.
- **New components:**
  - `frontend/src/components/dashboard/analysis/CohortOverview.tsx` — main two-column container.
  - `frontend/src/components/dashboard/analysis/ExperimentRow.tsx` — single row, used by both columns.
- **New hook:** `frontend/src/hooks/useCandidateExperiments.ts` — extracted from `CohortRail` so both `CohortRail` and `CohortOverview` share the candidate fetch logic.
- **Wiring:** `frontend/src/app/dashboard/analysis/page.tsx` adds a render branch for `state.analysis === 'cohort-overview'`. The sidebar `<CohortRail />` stays in the layout shell but, when `state.analysis === 'cohort-overview'`, hides its own candidates list, "All / None" controls, and "selected" count — its job is reduced to filters + "Load from set" + outcome picker. On every other analysis it renders unchanged.
- **Backend additive change:** `backend/app/serializers.py` and `backend/app/views.py` — opt-in `?include=variables` query param on `/api/experimentList/`.

## UX details

### Theme tab integration

The Cohort theme follows the same pattern as existing themes (`ThemeTabs.tsx` does not need changes — it iterates over `THEMES`). It has one sub-tab, `Cohort`, which is the only one shown when the theme is active. There is no "needs at least N experiments" gating; this view is the place where users build the cohort, so it must always be reachable.

### Layout

```
+----------------------------+----------------------------------------------+
|  Sidebar (280px)           |  Theme tabs: [Cohort] Kinetics  ...           |
|  - Cohort header           |                                              |
|  - Filters                 |  +----------------+  +--------------------+  |
|  - Load from set           |  | Candidates(N)  |  | Cohort (M)         |  |
|  - Outcome picker          |  | [search]       |  | [search]           |  |
|                            |  | All / None     |  | Clear              |  |
|                            |  | row            |  | row                |  |
|                            |  | row            |  | row                |  |
|                            |  | ...            |  | ...                |  |
|                            |  +----------------+  +--------------------+  |
+----------------------------+----------------------------------------------+
```

Both columns:
- Width 1fr each, `gap-3`, `p-6` consistent with existing analysis main area
- Header bar with column title + count, bulk action link(s), and a search input
- Body is a scrollable list of rows
- White card styling per `frontend/CLAUDE.md` (`bg-white border border-gray-200 rounded-lg`)

### Row content

Each row renders:
1. Checkbox (visual state) — checked iff the experiment is in the cohort
2. Experiment title
3. Variable tags — only for variables that are present in the user's `variableFilters` (i.e. the "Variables" filter currently has at least one value selected for that name). Each tag shows `name: value` in the existing tag style (`bg-fef3c7 text-amber-800 rounded-full text-xs`).
4. Strain name (right-aligned, muted)

If a candidate is also in the cohort, the row in the candidates column is rendered with greyed background (`bg-gray-100 text-gray-600`) and the checkbox shows checked. Clicking it removes from the cohort.

### Interaction

- **Click anywhere on a row** to toggle membership in the cohort. Same affordance as today's `CohortRail`.
- **All / None** above the candidates column: same behavior as today (selects/clears `state.ids`).
- **Clear** above the cohort column: equivalent to "None".
- **Search inputs** filter the visible rows in their column by case-insensitive substring match on title and strain name. Search state is component-local (not URL-persisted).

### Sort order

Both columns are sorted ascending by experiment title (decision 3A), matching the existing sidebar. No user-facing sort control in this iteration.

### Auto-drop on filter change (decision 2B)

When the active filters change such that some currently-selected experiments no longer match, `CohortOverview` automatically prunes them from `state.ids`:

```
const candidateIdSet = useMemo(() => new Set(candidates.map(c => c.id)), [candidates])
useEffect(() => {
  if (state.ids.some(id => !candidateIdSet.has(id))) {
    setState({ ids: state.ids.filter(id => candidateIdSet.has(id)) })
  }
}, [candidateIdSet])
```

This auto-drop is **scoped to `CohortOverview`** — the effect only mounts when the user is viewing this analysis. On other themes, narrowing filters does not silently drop the cohort (preserves the current behavior of `CohortRail`).

### Empty / loading states

| State | Candidates column | Cohort column |
|---|---|---|
| Loading filters/candidates | "Loading candidates…" | (renders normally) |
| No filter results | "No experiments match your filters." | (renders normally) |
| Cohort empty | (renders normally) | "Click experiments on the left to add them to your cohort." |
| Filters not yet loaded | "Loading filters…" full panel (matches `CohortRail` today) | n/a |

### Performance

- **Candidates column** — virtualized using `@tanstack/react-virtual` with the same row-size estimate as `CohortRail` (~36px). The candidate fetch already returns up to 5000 rows.
- **Cohort column** — non-virtualized; we expect tens, not thousands. Add virtualization later if needed.

## Backend change

### Why

The frontend needs each candidate row's `variables` array to render filter-variable tags. Today `ExperimentSerializer` (used by `experiment_list`) does not include variables.

### Change

In `backend/app/serializers.py`, add a list serializer that includes variables:

```python
class ExperimentListWithVariablesSerializer(ExperimentSerializer):
    variables = VariableSerializer(many=True, read_only=True)

    class Meta(ExperimentSerializer.Meta):
        fields = ExperimentSerializer.Meta.fields + ["variables"]
        read_only_fields = fields
```

In `backend/app/views.py` `experiment_list`:

- Read `request.GET.get('include', '')`.
- If the `include` value contains `variables`, use `ExperimentListWithVariablesSerializer` and add `.prefetch_related('variables')` to the queryset.
- Otherwise: behavior unchanged (existing serializer, no extra prefetch).

This keeps the default response shape and query plan identical, so the dashboard list and the existing `CohortRail` candidate fetch are unaffected.

### Permissions / multi-tenancy

The endpoint already enforces `IsAuthenticated, IsOrgMember` and scopes results to `project__organization=request.user.active_organization`. The new field reads variables off experiments already in that scoped queryset, so no additional scoping is required. No new permission classes.

### Tests (`backend/app/tests/test_views.py`)

Three new tests:

1. **`test_experiment_list_includes_variables_when_requested`** — request with `?include=variables` returns each experiment's `variables` as a list of `{name, value}` objects matching the experiment's M2M.
2. **`test_experiment_list_omits_variables_by_default`** — request without `include` does not have a `variables` key on any row (default behavior preserved).
3. **`test_experiment_list_variables_respect_org_isolation`** — User in org A requesting `?include=variables` cannot see variable rows for experiments in org B.

Run `python manage.py test app.tests` and confirm all tests pass.

## Frontend changes

### `frontend/src/lib/analysis/types.ts`

```ts
export type AnalysisSlug =
  | 'cohort-overview'
  | 'kinetic-analysis'
  | ...

export type ThemeId = 'cohort' | 'kinetics' | 'doe' | 'metabolic' | 'pattern'
```

### `frontend/src/lib/analysis/constants.ts`

Prepend the new theme:

```ts
export const THEMES = [
  { id: 'cohort', label: 'Cohort', analyses: [
    { slug: 'cohort-overview', label: 'Cohort', availableInP1: true },
  ]},
  { id: 'kinetics', label: 'Kinetics', analyses: [...] },
  ...
]

export const DEFAULT_THEME: ThemeId = 'cohort'
export const DEFAULT_ANALYSIS: AnalysisSlug = 'cohort-overview'
```

### `frontend/src/lib/analysis/api.ts`

Extend `ExperimentListParams` with `includeVariables?: boolean`. Update `fetchCandidateExperiments` to append `&include=variables` when set, and to type the returned row as:

```ts
{ id: number; title: string; description: string; variables?: Array<{ name: string; value: string }> }
```

The response shape is unchanged; the `variables` field is optional.

### `frontend/src/hooks/useCandidateExperiments.ts` (new)

Extract the debounced candidate fetch (currently inlined in `CohortRail.tsx`) into a shared hook:

```ts
export function useCandidateExperiments(args: {
  strainIds: number[]
  parentStrainIds: number[]
  batchMediaIds: number[]
  feedMediaIds: number[]
  variableFilters: Array<{ name: string; values: string[] }>
  includeVariables?: boolean
}): { candidates: Candidate[]; loading: boolean }
```

Where `Candidate` is the row shape including the optional `variables` field and the existing strain projection. The hook uses the same 300ms debounce, abort-on-unmount, and `pageSize: 5000` already in `CohortRail`.

### `frontend/src/components/dashboard/analysis/CohortRail.tsx`

Two changes:

1. Refactor to use `useCandidateExperiments({ ...filters })` (without `includeVariables`). The local `candidates`, `loadingCandidates`, and the `useEffect` that fetches them are removed.
2. Conditional rendering: read `state.analysis` from `useAnalysisState`. When it equals `'cohort-overview'`, do **not** render the candidates section ("Candidates (N) — M selected" header, All/None buttons, virtualized list). Filters, "Load from set", and the outcome picker continue to render. On every other analysis, render exactly as today.

When the candidates list is hidden, the candidate fetch hook still runs (its result drives the "All" button correctness when the user returns to non-cohort analyses, and is cheap relative to the fetch already happening in `CohortOverview`). If perf telemetry later shows duplicate fetching is wasteful, the hook can be lifted into a context — out of scope for this spec.

### `frontend/src/components/dashboard/analysis/ExperimentRow.tsx` (new)

```ts
interface Props {
  experiment: { id: number; title: string; strain_name: string | null; variables?: Array<{ name: string; value: string }> }
  inCohort: boolean
  activeFilterVariableNames: string[]   // names from variableFilters with at least one value selected
  onClick: () => void
  variant: 'candidate' | 'cohort'
}
```

Renders the row markup described above. The candidates `variant` shows a checkbox; the cohort `variant` shows a small `×` button. Greyed styling applied when `variant === 'candidate' && inCohort`.

### `frontend/src/components/dashboard/analysis/CohortOverview.tsx` (new)

Pulls `state` and `setState` from `useAnalysisState`, fetches candidates with `useCandidateExperiments({ ...filters, includeVariables: true })`, owns local `candidateSearch` and `cohortSearch` state, derives:

- `activeFilterVariableNames = state.variableFilters.filter(f => f.values.length).map(f => f.name)`
- `candidateIdSet = new Set(candidates.map(c => c.id))`
- `cohortRows = candidates.filter(c => state.ids.includes(c.id))` (after auto-drop, this equals all selected ids)
- `filteredCandidateRows = candidates.filter(matches candidateSearch)`
- `filteredCohortRows = cohortRows.filter(matches cohortSearch)`

Renders the layout from the UX section. Uses the same virtualized list pattern as `CohortRail` for the candidates column.

### `frontend/src/app/dashboard/analysis/page.tsx`

Add the render branch:

```tsx
{state.analysis === 'cohort-overview' && (
  <CohortOverview />
)}
```

The "Pick experiments on the left to begin." empty hint at the top of the main area should be suppressed when the analysis is `cohort-overview` (the picker is now the main view, so the hint is redundant). Either guard the existing block on `state.analysis !== 'cohort-overview'`, or move the hint into each non-cohort analysis component — guarding in place is the smaller change and is preferred.

### Frontend verification

`frontend/` has no Jest/Vitest setup — only `lint` and `build`. Per `CLAUDE.md`'s frontend testing rule, verify with:

```bash
cd frontend
npm run lint
npm run build
```

Both must pass before declaring the work complete. Manually verify in the browser:

1. Default landing on `/dashboard/analysis` shows the Cohort tab active and the two-column view.
2. Toggling rows updates both columns and the URL `ids` param.
3. Adding a variable filter (e.g. `pulse size: 40`) makes the corresponding tags appear on rows.
4. Narrowing filters until some selected ids no longer match auto-drops them and the cohort column shrinks.
5. Switching to another theme tab (e.g. Kinetics) shows the existing analyses with the cohort intact.
6. Search box on each column filters that column locally without affecting the other.

## Out of scope

- Drag-and-drop between columns
- Per-row "Add" / "Remove" buttons (clicking the row handles both)
- Sorting other than by title
- Persisting per-column search strings in the URL
- Virtualization of the cohort column
- Showing variables outside of the active filter set (no "+more" expander)
- Any change to the data model or to the `CohortPayload` API
