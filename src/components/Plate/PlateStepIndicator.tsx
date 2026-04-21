'use client'

import React from 'react'
import { Check } from 'lucide-react'

const STEPS = [
  { label: 'Details', number: 1 },
  { label: 'Plates & Wells', number: 2 },
  { label: 'Review', number: 3 },
] as const

export function PlateStepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, i) => {
        const isComplete = step.number < currentStep
        const isCurrent = step.number === currentStep
        return (
          <React.Fragment key={step.number}>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                  isComplete ? 'bg-green-500 text-white' :
                  isCurrent ? 'bg-[#eb5234] text-white' :
                  'bg-gray-200 text-gray-400'
                }`}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : step.number}
              </div>
              <span
                className={`text-xs font-semibold ${
                  isComplete ? 'text-green-500' :
                  isCurrent ? 'text-[#eb5234]' :
                  'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 ${isComplete ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
