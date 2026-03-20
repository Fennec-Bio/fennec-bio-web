'use client'

import React from 'react'

export function CreateExperiment() {
  return (
    <div className="flex flex-col gap-4">
      {/* Controls row */}
      <div className="flex gap-3 w-full">
        {/* Experiment name input */}
        <div className="flex-1">
          <button
            className="w-full h-9 px-4 py-2 rounded-md text-sm font-medium text-white shadow-xs opacity-60 cursor-not-allowed truncate"
            style={{ backgroundColor: '#eb5234' }}
            disabled
          >
            New Experiment
          </button>
        </div>

        {/* Graph type placeholder */}
        <div>
          <button
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs opacity-60 cursor-not-allowed"
            disabled
          >
            Line
          </button>
        </div>

        {/* Metabolites placeholder */}
        <div>
          <button
            className="h-9 px-4 py-2 border border-gray-200 rounded-md text-sm font-medium shadow-xs opacity-60 cursor-not-allowed"
            disabled
          >
            Metabolites
          </button>
        </div>
      </div>

      {/* Empty description area */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 text-sm">Experiment Description:</h3>
        <p className="text-gray-400 text-sm mt-1 min-h-[5rem]">No experiment selected</p>
      </div>

      {/* Empty graph area */}
      <div className="flex items-center justify-center h-[400px] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <div className="text-center">
          <p className="text-gray-400 text-sm">Graph will appear here</p>
          <p className="text-gray-300 text-xs mt-1">Select or create an experiment to get started</p>
        </div>
      </div>

      {/* Toggle switches placeholder */}
      <div className="flex gap-6 justify-center">
        {(['Variables', 'Events', 'Anomalies'] as const).map((label) => (
          <div key={label} className="flex items-center gap-2">
            <button
              className="w-12 h-6 rounded-full bg-gray-300 cursor-not-allowed"
              disabled
            >
              <div className="w-5 h-5 bg-white rounded-full translate-x-0.5" />
            </button>
            <span className="text-sm font-medium text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CreateExperiment
