'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CohortPayload, ExperimentInPayload, TimeSeriesEntry } from '@/lib/analysis/types'
import {
  type KineticParams,
  calculateGrowthRate,
  calculateProductionRate,
  calculateProductivity,
  calculateYield,
  detectPhases,
  findBiomassData,
  findSubstrateData,
  getFinalTiter,
} from '@/lib/analysis/kineticsUtils'
import { KineticSummary } from './KineticSummary'
import { PhaseDetector } from './PhaseDetector'
import { ComparisonTable } from './ComparisonTable'

function findProductSeries(exp: ExperimentInPayload, productName: string): TimeSeriesEntry | null {
  return exp.time_series.find((s) => s.category === 'product' && s.name === productName) ?? null
}

function calculateKineticParams(
  exp: ExperimentInPayload,
  productName: string,
): KineticParams | null {
  const biomass = findBiomassData(exp.time_series)
  if (!biomass) return null

  const product = findProductSeries(exp, productName)
  if (!product) return null

  const substrate = findSubstrateData(exp.time_series)

  const growth = calculateGrowthRate(biomass.timepoints, biomass.values)
  const prodRate = calculateProductionRate(
    product.timepoints_h, product.values,
    biomass.timepoints, biomass.values,
  )

  let yps: number | null = null
  if (substrate) {
    yps = calculateYield(
      product.timepoints_h, product.values,
      substrate.timepoints_h, substrate.values,
    )
  }

  const productivity = calculateProductivity(product.timepoints_h, product.values)
  const finalTiter = getFinalTiter(product.timepoints_h, product.values)
  const phases = detectPhases(biomass.timepoints, biomass.values)

  return {
    experimentId: exp.id,
    title: exp.title,
    muMax: growth?.muMax ?? null,
    qpMax: prodRate?.qpMax ?? null,
    yps,
    productivity,
    finalTiter,
    phases,
    biomassType: biomass.name,
  }
}

export function KineticAnalysis({ payload }: { payload: CohortPayload }) {
  const experiments = payload.experiments

  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [selectedExperiment, setSelectedExperiment] = useState<number | null>(null)

  const products = useMemo(() => {
    const set = new Set<string>()
    experiments.forEach((exp) => {
      exp.time_series.forEach((s) => { if (s.category === 'product') set.add(s.name) })
    })
    return Array.from(set).sort()
  }, [experiments])

  useEffect(() => {
    if (products.length > 0 && !products.includes(selectedProduct)) {
      setSelectedProduct(products[0])
      setSelectedExperiment(null)
    }
  }, [products, selectedProduct])

  const kineticParams = useMemo(() => {
    if (!selectedProduct) return [] as KineticParams[]
    const params: KineticParams[] = []
    experiments.forEach((exp) => {
      const r = calculateKineticParams(exp, selectedProduct)
      if (r) params.push(r)
    })
    return params
  }, [experiments, selectedProduct])

  useEffect(() => {
    if (kineticParams.length === 0) {
      setSelectedExperiment(null)
      return
    }
    if (selectedExperiment === null || !kineticParams.find((k) => k.experimentId === selectedExperiment)) {
      setSelectedExperiment(kineticParams[0].experimentId)
    }
  }, [kineticParams, selectedExperiment])

  const selectedExpData = useMemo(() => {
    if (!selectedExperiment) return null
    const exp = experiments.find((e) => e.id === selectedExperiment)
    if (!exp) return null
    const biomass = findBiomassData(exp.time_series)
    if (!biomass) return null
    const product = findProductSeries(exp, selectedProduct)
    const kinetics = kineticParams.find((k) => k.experimentId === selectedExperiment)
    return {
      experiment: exp,
      biomassName: biomass.name,
      biomassTimepoints: biomass.timepoints,
      biomassValues: biomass.values,
      productTimepoints: product?.timepoints_h ?? [],
      productValues: product?.values ?? [],
      phases: kinetics?.phases ?? [],
    }
  }, [selectedExperiment, experiments, selectedProduct, kineticParams])

  const experimentsWithKinetics = useMemo(() => {
    return kineticParams.map((k) => ({ id: k.experimentId, title: k.title }))
  }, [kineticParams])

  const biomassTypesUsed = useMemo(() => {
    const types = new Set<string>()
    kineticParams.forEach((k) => { if (k.biomassType) types.add(k.biomassType) })
    return Array.from(types)
  }, [kineticParams])

  return (
    <div className="p-4">
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product:</label>
          <select
            value={selectedProduct}
            onChange={(e) => { setSelectedProduct(e.target.value); setSelectedExperiment(null) }}
            className="border rounded px-3 py-2 min-w-[200px]"
          >
            {products.length === 0 && <option value="">No products</option>}
            {products.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Experiment:</label>
          <select
            value={selectedExperiment ?? ''}
            onChange={(e) => setSelectedExperiment(Number(e.target.value))}
            className="border rounded px-3 py-2 min-w-[250px]"
            disabled={experimentsWithKinetics.length === 0}
          >
            {experimentsWithKinetics.map((exp) => (
              <option key={exp.id} value={exp.id}>{exp.title}</option>
            ))}
          </select>
        </div>

        {biomassTypesUsed.length > 0 && (
          <div className="flex items-end">
            <span className="text-sm text-gray-500">Using: {biomassTypesUsed.join(', ')}</span>
          </div>
        )}
      </div>

      {kineticParams.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No kinetic data available.</p>
          <p className="text-sm mt-2">
            Experiments must have biomass data (DCW, OD, or similar) and product measurements.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <KineticSummary kineticParams={kineticParams} selectedExperimentId={selectedExperiment} />

          {selectedExpData && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-medium text-gray-900">{selectedExpData.experiment.title}</h3>
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                  {selectedExpData.biomassName}
                </span>
              </div>
              <PhaseDetector
                timepoints={selectedExpData.biomassTimepoints}
                biomassValues={selectedExpData.biomassValues}
                productTimepoints={selectedExpData.productTimepoints}
                productValues={selectedExpData.productValues}
                phases={selectedExpData.phases}
                productName={selectedProduct}
                biomassName={selectedExpData.biomassName}
              />
            </div>
          )}

          <ComparisonTable
            kineticParams={kineticParams}
            onSelectExperiment={setSelectedExperiment}
            selectedExperiment={selectedExperiment}
          />
        </div>
      )}
    </div>
  )
}
