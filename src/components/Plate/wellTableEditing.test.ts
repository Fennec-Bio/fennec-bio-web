import assert from 'node:assert/strict'
import {
  applyCellBlock,
  buildFillRows,
  parsePastedBlock,
  type EditableColumn,
} from './wellTableEditing'

const columns: EditableColumn[] = [
  { kind: 'variable', key: 'Strain' },
  { kind: 'variable', key: 'Media' },
  { kind: 'measurement', key: 7 },
]

const wellKeys = ['A1', 'A2']

assert.deepEqual(parsePastedBlock('S1\tM1\nS2\tM2\n'), [
  ['S1', 'M1'],
  ['S2', 'M2'],
])
assert.deepEqual(parsePastedBlock('single value'), [['single value']])

const initialGrids = {
  variableGrids: {
    Strain: { A1: 'old-strain', A3: 'untouched' },
    Media: {},
  },
  measurementGrids: {
    7: { A1: '0', A3: '99' },
  },
}

const pasted = applyCellBlock(initialGrids, columns, wellKeys, { columnIndex: 0, wellIndex: 0 }, [
  [' S1 ', ' M1 ', ' 10 '],
  ['S2', 'M2', '11'],
  ['S3', 'M3', '12'],
])

assert.deepEqual(pasted.variableGrids.Strain, { A1: 'S1', A2: 'S2', A3: 'untouched' })
assert.deepEqual(pasted.variableGrids.Media, { A1: 'M1', A2: 'M2' })
assert.deepEqual(pasted.measurementGrids[7], { A1: '10', A2: '11', A3: '99' })
assert.equal(initialGrids.variableGrids.Strain.A1, 'old-strain')
assert.equal(initialGrids.measurementGrids[7].A1, '0')

const offsetPaste = applyCellBlock(initialGrids, columns, wellKeys, { columnIndex: 1, wellIndex: 1 }, [
  ['M2', '12', 'ignored'],
])

assert.deepEqual(offsetPaste.variableGrids.Media, { A2: 'M2' })
assert.deepEqual(offsetPaste.measurementGrids[7], { A1: '0', A2: '12', A3: '99' })
assert.deepEqual(offsetPaste.variableGrids.Strain, { A1: 'old-strain', A3: 'untouched' })

const clearingPaste = applyCellBlock(initialGrids, columns, wellKeys, { columnIndex: 0, wellIndex: 0 }, [
  [''],
])

assert.deepEqual(clearingPaste.variableGrids.Strain, { A3: 'untouched' })

assert.deepEqual(buildFillRows('copy-me', 3, 1), {
  startWellIndex: 1,
  rows: [['copy-me'], ['copy-me'], ['copy-me']],
})
