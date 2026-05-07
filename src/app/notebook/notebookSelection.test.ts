import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  resolveNotebookExperimentTarget,
  type NotebookExperimentLookup,
} from './notebookSelection'

const experiments: NotebookExperimentLookup[] = [
  { id: 1, title: 'Ferm 121-BA' },
  { id: 2, title: 'Ferm 122-BA' },
  { id: 3, title: 'Ferm 122-BA' },
]

describe('resolveNotebookExperimentTarget', () => {
  it('uses the URL id to disambiguate duplicate experiment titles', () => {
    assert.deepEqual(
      resolveNotebookExperimentTarget(experiments, {
        title: 'Ferm 122-BA',
        id: '3',
      }),
      { id: 3, title: 'Ferm 122-BA' },
    )
  })

  it('returns a URL-backed target when the experiment is not in the sidebar list', () => {
    assert.deepEqual(
      resolveNotebookExperimentTarget(experiments, {
        title: 'Ferm 90-BC',
        id: '90',
      }),
      { id: 90, title: 'Ferm 90-BC' },
    )
  })

  it('falls back to title matching for existing title-only links', () => {
    assert.deepEqual(
      resolveNotebookExperimentTarget(experiments, {
        title: 'Ferm 121-BA',
        id: null,
      }),
      { id: 1, title: 'Ferm 121-BA' },
    )
  })
})
