import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ClassifiedData } from './Step2Upload'
import {
  buildFermentationMetadataPayload,
  buildPumpSeriesOptions,
  buildPumpSeriesOptionsFromProcessRows,
} from './experimentFermentationMetadata'

const classifiedData = (names: string[]): ClassifiedData => ({
  products: [],
  secondary_products: [],
  process_data: names.map((name) => ({
    name,
    column_header: name,
    unit: 'mL',
    type: name,
    data_type: 'continuous',
    time_unit: 'minutes',
    data: [{ time: '0', value: 1 }],
  })),
  ignored: [],
})

describe('buildPumpSeriesOptions', () => {
  it('returns sorted unique process-data series names', () => {
    const options = buildPumpSeriesOptions(classifiedData(['Waste Pump', 'Feed Pump', 'Feed Pump']))
    assert.deepEqual(options.map((option) => option.name), ['Feed Pump', 'Waste Pump'])
    assert.equal(options[0].unit, 'mL')
  })
})

describe('buildPumpSeriesOptionsFromProcessRows', () => {
  it('returns sorted unique process variables from edit experiment process rows', () => {
    const options = buildPumpSeriesOptionsFromProcessRows([
      { name: 'Waste Pump', unit: 'mL' },
      { name: 'Feed Pump', unit: 'mL' },
      { name: 'Feed Pump', unit: 'mL' },
    ])

    assert.deepEqual(options, [
      { name: 'Feed Pump', unit: 'mL', pointCount: 2 },
      { name: 'Waste Pump', unit: 'mL', pointCount: 1 },
    ])
  })
})

describe('buildFermentationMetadataPayload', () => {
  it('normalizes batch volume and pump selections for the API payload', () => {
    assert.deepEqual(
      buildFermentationMetadataPayload({
        batchVolumeMl: '750',
        feedPumpSeries: 'Feed Pump',
        wastePumpSeries: 'Waste Pump',
      }),
      {
        batch_volume_ml: 750,
        feed_pump_series: 'Feed Pump',
        waste_pump_series: 'Waste Pump',
      },
    )
  })

  it('uses null and empty strings for omitted optional fields', () => {
    assert.deepEqual(
      buildFermentationMetadataPayload({
        batchVolumeMl: '',
        feedPumpSeries: '',
        wastePumpSeries: '',
      }),
      {
        batch_volume_ml: null,
        feed_pump_series: '',
        waste_pump_series: '',
      },
    )
  })
})
