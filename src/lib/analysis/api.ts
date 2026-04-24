import type { CohortPayload, AnovaResult, OutcomeMetric } from './types'

export interface UniqueNamesResponse {
  products: string[]
  secondary_products: string[]
  process_data: string[]
  variables: Record<string, string[]>
  events: string[]
  anomalies: string[]
  strains: Array<{ id: number; name: string }>
  parent_strains: Array<{ id: number; name: string }>
  batch_media_list: Array<{ id: number; name: string }>
  feed_media_list: Array<{ id: number; name: string }>
}

export async function fetchUniqueNames(token: string | null): Promise<UniqueNamesResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/uniqueNames/`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  )
  if (!res.ok) throw new Error(`uniqueNames fetch failed: ${res.status}`)
  return res.json()
}

export interface ExperimentListParams {
  strainIds?: number[]
  parentStrainIds?: number[]
  batchMediaIds?: number[]
  feedMediaIds?: number[]
  page?: number
  pageSize?: number
  projectId?: number | null
}

export async function fetchCandidateExperiments(
  token: string | null,
  params: ExperimentListParams,
): Promise<{
  experiments: Array<{ id: number; title: string; description: string }>
  total: number
  page: number
  totalPages: number
}> {
  const qs = new URLSearchParams()
  if (params.strainIds?.length)        qs.set('strain__in',        params.strainIds.join(','))
  if (params.parentStrainIds?.length)  qs.set('parent_strain__in', params.parentStrainIds.join(','))
  if (params.batchMediaIds?.length)    qs.set('batch_media__in',   params.batchMediaIds.join(','))
  if (params.feedMediaIds?.length)     qs.set('feed_media__in',    params.feedMediaIds.join(','))
  if (params.page)                     qs.set('page',              String(params.page))
  if (params.projectId)                qs.set('project_id',        String(params.projectId))
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

export async function fetchCohortPayload(
  token: string | null,
  experimentIds: number[],
): Promise<CohortPayload> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/analysis/cohort/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ experiment_ids: experimentIds }),
    },
  )
  if (!res.ok) throw new Error(`cohort fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchAnova(
  token: string | null,
  experimentIds: number[],
  outcome: OutcomeMetric,
  product: string | null,
): Promise<AnovaResult> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/analysis/anova/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ experiment_ids: experimentIds, outcome, product }),
    },
  )
  if (!res.ok) throw new Error(`anova fetch failed: ${res.status}`)
  return res.json()
}
