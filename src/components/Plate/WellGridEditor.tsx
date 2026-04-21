'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Plate } from '@/hooks/usePlateExperiment'
import { DataCategory } from '@/hooks/useDataCategories'

const ROWS_96  = ['A','B','C','D','E','F','G','H']
const ROWS_384 = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P']
const COLS_96  = Array.from({ length: 12 }, (_, i) => i + 1)
const COLS_384 = Array.from({ length: 24 }, (_, i) => i + 1)

export function WellGridEditor({
  plate, dataCategories, onSaved,
}: {
  plate: Plate
  dataCategories: DataCategory[]
  onSaved: () => void
}) {
  const { getToken } = useAuth()
  const rows = plate.format === '96' ? ROWS_96 : ROWS_384
  const cols = plate.format === '96' ? COLS_96 : COLS_384

  const [variableGrids, setVariableGrids] = useState<Record<string, Record<string, string>>>({})
  const [measurementGrids, setMeasurementGrids] = useState<Record<number, Record<string, string>>>({})
  const [variableNames, setVariableNames] = useState<string[]>([])
  const [measurementIds, setMeasurementIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const varNames = new Set<string>()
    const measIds = new Set<number>()
    const vars: Record<string, Record<string, string>> = {}
    const meas: Record<number, Record<string, string>> = {}
    plate.wells.forEach(w => {
      const k = `${w.row}${w.column}`
      w.variables.forEach(v => {
        varNames.add(v.name)
        vars[v.name] = vars[v.name] || {}
        vars[v.name][k] = v.value
      })
      w.data_points.forEach(dp => {
        measIds.add(dp.data_category)
        meas[dp.data_category] = meas[dp.data_category] || {}
        meas[dp.data_category][k] = String(dp.value)
      })
    })
    setVariableGrids(vars)
    setMeasurementGrids(meas)
    setVariableNames([...varNames])
    setMeasurementIds([...measIds])
  }, [plate])

  const allowedCategories = useMemo(
    () => dataCategories.filter(c => c.category !== 'process_data'),
    [dataCategories],
  )

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const token = await getToken()
      const wellKeys = new Set<string>()
      Object.values(variableGrids).forEach(g => Object.keys(g).forEach(k => wellKeys.add(k)))
      Object.values(measurementGrids).forEach(g => Object.keys(g).forEach(k => wellKeys.add(k)))

      const wells = Array.from(wellKeys).map(k => {
        const row = k.charAt(0)
        const column = parseInt(k.slice(1), 10)
        const variables = Object.entries(variableGrids)
          .map(([name, grid]) => ({ name, value: grid[k] ?? '' }))
          .filter(v => v.value !== '')
        const data_points = Object.entries(measurementGrids)
          .map(([catId, grid]) => {
            const raw = grid[k]
            if (raw === undefined || raw === '') return null
            const value = parseFloat(raw)
            if (Number.isNaN(value)) return null
            return { data_category_id: Number(catId), value }
          })
          .filter((d): d is { data_category_id: number; value: number } => d !== null)
        return { row, column, variables, data_points }
      })

      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/plates/${plate.id}/wells/`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ wells }),
        },
      )
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${resp.status}`)
      }
      onSaved()
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {variableNames.map(name => (
        <VariableGrid
          key={name}
          name={name}
          rows={rows}
          cols={cols}
          values={variableGrids[name] || {}}
          onChange={grid => setVariableGrids(s => ({ ...s, [name]: grid }))}
          onRemove={() => {
            setVariableNames(s => s.filter(n => n !== name))
            setVariableGrids(s => { const c = { ...s }; delete c[name]; return c })
          }}
        />
      ))}
      <AddVariableButton
        existing={variableNames}
        onAdd={name => setVariableNames(s => [...s, name])}
      />

      {measurementIds.map(id => {
        const cat = allowedCategories.find(c => c.id === id)
        if (!cat) return null
        return (
          <MeasurementGrid
            key={id}
            category={cat}
            rows={rows}
            cols={cols}
            values={measurementGrids[id] || {}}
            onChange={grid => setMeasurementGrids(s => ({ ...s, [id]: grid }))}
            onRemove={() => {
              setMeasurementIds(s => s.filter(i => i !== id))
              setMeasurementGrids(s => { const c = { ...s }; delete c[id]; return c })
            }}
          />
        )
      })}
      <AddMeasurementButton
        allowed={allowedCategories}
        selected={measurementIds}
        onAdd={id => setMeasurementIds(s => [...s, id])}
      />

      {saveError && <div className="rounded bg-red-50 p-2 text-sm text-red-600">{saveError}</div>}
      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save plate'}
      </button>
    </div>
  )
}

function GridShell({
  title, rows, cols, values, onChange, onRemove,
}: {
  title: React.ReactNode
  rows: string[]
  cols: number[]
  values: Record<string, string>
  onChange: (grid: Record<string, string>) => void
  onRemove: () => void
}) {
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT') {
      const input = target as HTMLInputElement
      const key = input.dataset.wellKey
      if (!key) return
      const text = e.clipboardData.getData('text')
      if (!text.includes('\t') && !text.includes('\n')) return
      e.preventDefault()
      const startRowIdx = rows.indexOf(key.charAt(0))
      const startColIdx = cols.indexOf(parseInt(key.slice(1), 10))
      if (startRowIdx < 0 || startColIdx < 0) return
      const lines = text.split(/\r?\n/).filter(l => l.length > 0)
      const next = { ...values }
      lines.forEach((line, r) => {
        const cells = line.split('\t')
        cells.forEach((cell, c) => {
          const rIdx = startRowIdx + r
          const cIdx = startColIdx + c
          if (rIdx >= rows.length || cIdx >= cols.length) return
          const k = `${rows[rIdx]}${cols[cIdx]}`
          const v = cell.trim()
          if (v === '') delete next[k]
          else next[k] = v
        })
      })
      onChange(next)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200" onPaste={handlePaste}>
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <div className="font-medium text-gray-900">{title}</div>
        <button
          onClick={onRemove}
          className="text-sm text-gray-500 hover:text-red-600"
        >
          Remove
        </button>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th />
              {cols.map(c => <th key={c} className="px-1 text-center text-gray-500">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r}>
                <th className="pr-1 text-right text-gray-500">{r}</th>
                {cols.map(c => {
                  const k = `${r}${c}`
                  return (
                    <td key={c} className="p-0">
                      <input
                        data-well-key={k}
                        className="h-7 w-16 border border-gray-200 px-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-[#eb5234]"
                        value={values[k] ?? ''}
                        onChange={e => {
                          const next = { ...values, [k]: e.target.value }
                          if (e.target.value === '') delete next[k]
                          onChange(next)
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VariableGrid(props: {
  name: string
  rows: string[]
  cols: number[]
  values: Record<string, string>
  onChange: (grid: Record<string, string>) => void
  onRemove: () => void
}) {
  return <GridShell title={`Variable: ${props.name}`} {...props} />
}

function MeasurementGrid(props: {
  category: DataCategory
  rows: string[]
  cols: number[]
  values: Record<string, string>
  onChange: (grid: Record<string, string>) => void
  onRemove: () => void
}) {
  return (
    <GridShell
      title={`${props.category.name} (${props.category.unit || '—'})`}
      rows={props.rows}
      cols={props.cols}
      values={props.values}
      onChange={props.onChange}
      onRemove={props.onRemove}
    />
  )
}

function AddVariableButton({
  existing, onAdd,
}: { existing: string[]; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 border border-gray-200 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
      >
        + Add variable
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <input
        className="h-9 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
        placeholder="Variable name (e.g. strain)"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <button
        disabled={!name.trim() || existing.includes(name.trim())}
        onClick={() => { onAdd(name.trim()); setOpen(false); setName('') }}
        className="px-3 py-1.5 bg-[#eb5234] text-white rounded-md text-sm font-medium hover:bg-[#d4492f] disabled:opacity-50"
      >
        Add
      </button>
      <button
        onClick={() => { setOpen(false); setName('') }}
        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        Cancel
      </button>
    </div>
  )
}

function AddMeasurementButton({
  allowed, selected, onAdd,
}: { allowed: DataCategory[]; selected: number[]; onAdd: (id: number) => void }) {
  const options = allowed.filter(c => !selected.includes(c.id))
  if (options.length === 0) return null
  return (
    <select
      className="h-9 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#eb5234]"
      value=""
      onChange={e => { if (e.target.value) onAdd(Number(e.target.value)) }}
    >
      <option value="">+ Add measurement…</option>
      {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}
