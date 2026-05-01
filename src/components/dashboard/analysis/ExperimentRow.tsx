'use client'

interface Variable {
  name: string
  value: string
}

interface ExperimentRowProps {
  experiment: {
    id: number
    title: string
    strain_name: string | null
    variables?: Variable[]
  }
  inCohort: boolean
  activeFilterVariableNames: string[]
  variant: 'candidate' | 'cohort'
  onClick: () => void
}

export function ExperimentRow({
  experiment,
  inCohort,
  activeFilterVariableNames,
  variant,
  onClick,
}: ExperimentRowProps) {
  const greyed = variant === 'candidate' && inCohort

  const tagVariables: Variable[] =
    activeFilterVariableNames.length === 0 || !experiment.variables
      ? []
      : experiment.variables.filter(v => activeFilterVariableNames.includes(v.name))

  return (
    <div
      onClick={onClick}
      className={[
        'px-3 py-2 flex items-center gap-2 text-sm border-b border-gray-100 cursor-pointer',
        greyed ? 'bg-gray-100 text-gray-600' : 'hover:bg-gray-50',
      ].join(' ')}
    >
      {variant === 'candidate' && (
        <input type="checkbox" readOnly checked={inCohort} />
      )}
      <span className="truncate flex-1">{experiment.title}</span>
      {tagVariables.map(v => (
        <span
          key={v.name}
          className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 whitespace-nowrap"
        >
          {v.name}: {v.value}
        </span>
      ))}
      <span className="text-xs text-gray-400 truncate max-w-[100px]">
        {experiment.strain_name ?? '—'}
      </span>
      {variant === 'cohort' && (
        <span
          className="text-gray-400 hover:text-gray-700 cursor-pointer text-base leading-none"
          aria-label="Remove from cohort"
        >
          ×
        </span>
      )}
    </div>
  )
}
