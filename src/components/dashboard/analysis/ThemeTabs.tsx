'use client'

import { useAnalysisState } from '@/hooks/useAnalysisState'
import { THEMES } from '@/lib/analysis/constants'
import type { AnalysisSlug, ThemeId } from '@/lib/analysis/types'

export function ThemeTabs({ cohortSize }: { cohortSize: number }) {
  const [state, setState] = useAnalysisState()
  const activeTheme = THEMES.find(t => t.id === state.theme) ?? THEMES[0]

  return (
    <div>
      {/* Theme tabs */}
      <div className="flex gap-1 border-b-2 border-[#eb5234] items-end">
        {THEMES.map(t => {
          const active = t.id === state.theme
          return (
            <button
              key={t.id}
              onClick={() => {
                const first = t.analyses.find(a => a.availableInP1)
                setState({
                  theme: t.id as ThemeId,
                  analysis: first ? first.slug : t.analyses[0].slug,
                })
              }}
              className={[
                'px-4 py-2 text-sm font-medium rounded-t-md transition-colors',
                active ? 'bg-[#eb5234] text-white' : 'text-gray-600 hover:bg-gray-100',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Sub-tabs for active theme */}
      <div className="flex gap-1 mt-3">
        {activeTheme.analyses.map(a => {
          const active = a.slug === state.analysis
          const gated = !a.availableInP1
          const anovaNotEnough = a.slug === 'anova-heatmap' && cohortSize < 3
          const disabled = gated || anovaNotEnough
          return (
            <button
              key={a.slug}
              disabled={disabled}
              onClick={() => setState({ analysis: a.slug as AnalysisSlug })}
              className={[
                'px-3 py-1.5 text-sm rounded-md transition-colors relative',
                active
                  ? 'bg-gray-200 text-gray-900 font-medium'
                  : 'text-gray-700 hover:bg-gray-100',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
              title={
                gated
                  ? 'Coming in a later phase'
                  : anovaNotEnough
                    ? `Needs at least 3 experiments (have ${cohortSize})`
                    : undefined
              }
            >
              {a.label}
              {gated && (
                <span className="ml-1 text-[10px] text-gray-400">soon</span>
              )}
              {anovaNotEnough && !gated && (
                <span className="ml-1 text-[10px] text-amber-600">
                  needs {3 - cohortSize} more
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
