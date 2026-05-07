import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  CohortPayload,
  ExperimentInPayload,
  MediaComponent,
  MediaInPayload,
} from '../../../lib/analysis/types'
import {
  buildMediaScanPointData,
  notebookUrlForExperimentTitle,
} from './mediaScanLogic'

function component(name: string): MediaComponent {
  return {
    name,
    concentration: 1,
    molecular_weight: null,
  }
}

function batchMedia(complexComponents: string[]): MediaInPayload {
  return {
    id: 1,
    name: 'Batch media',
    type: '',
    carbon_sources: [],
    nitrogen_sources: [],
    complex_components: complexComponents.map(component),
    additional_components: [],
  }
}

function experiment(id: number, complexComponents: string[]): ExperimentInPayload {
  return {
    id,
    title: `Experiment ${id}`,
    date: null,
    project_id: 1,
    strain: null,
    batch_media: batchMedia(complexComponents),
    feed_media: null,
    batch_volume_ml: null,
    feed_pump_series: '',
    waste_pump_series: '',
    variables: [],
    outcomes: {
      final_titer: { CBDa: id },
      max_titer: {},
      productivity: {},
      yps: {},
      ypx: {},
      biomass: null,
      mu_max: null,
      substrate_rate: null,
    },
    time_series: [],
  }
}

describe('buildMediaScanPointData', () => {
  it('uses component-set identity buckets with an explicit no-label bucket', () => {
    const payload: CohortPayload = {
      experiments: [
        experiment(1, ['YE2']),
        experiment(2, ['YE5']),
        experiment(3, ['YE2', 'YE5']),
        experiment(4, []),
      ],
      products: ['CBDa'],
      role_map_version: 1,
      warnings: [],
    }

    const points = buildMediaScanPointData(
      payload,
      { kind: 'component_identity', source: 'complex' },
      'final_titer',
      'CBDa',
    )

    assert.deepEqual(points.map(point => point.x), [
      'YE2',
      'YE5',
      'YE2, YE5',
      'No label',
    ])
  })
})

describe('notebookUrlForExperimentTitle', () => {
  it('builds the notebook experiment URL using the encoded title', () => {
    assert.equal(
      notebookUrlForExperimentTitle('Ferm 90-BA & YE5'),
      '/notebook?experiment=Ferm%2090-BA%20%26%20YE5',
    )
  })

  it('includes the experiment id when one is available', () => {
    assert.equal(
      notebookUrlForExperimentTitle('Ferm 122-BA', 122),
      '/notebook?experiment=Ferm%20122-BA&id=122',
    )
  })
})
