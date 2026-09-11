import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Holding, HoldingFormData } from '../types'

interface HoldingFormProps {
  mode: 'create' | 'edit'
  initial?: Holding | null
  isLoading: boolean
  onSubmit: (data: HoldingFormData) => Promise<void>
  onCancel?: () => void
}

const emptyForm: HoldingFormData = {
  isin: '',
  holdings: '',
  costPrice: '',
}

export function HoldingForm({
  mode,
  initial,
  isLoading,
  onSubmit,
  onCancel,
}: HoldingFormProps) {
  const [form, setForm] = useState<HoldingFormData>(() =>
    mode === 'edit' && initial
      ? {
          isin: initial.isin,
          holdings: String(initial.holdings),
          costPrice: String(initial.costPrice),
        }
      : emptyForm,
  )
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)

    const isin = form.isin.trim().toUpperCase()
    const holdings = Number(form.holdings)
    const costPrice = Number(form.costPrice)

    if (!isin) {
      setLocalError('ISIN is required')
      return
    }

    if (!Number.isFinite(holdings) || holdings <= 0) {
      setLocalError('Holdings must be a positive number')
      return
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      setLocalError('Price must be zero or greater')
      return
    }

    try {
      await onSubmit({
        isin,
        holdings: String(holdings),
        costPrice: String(costPrice),
      })

      if (mode === 'create') {
        setForm(emptyForm)
      }
    } catch {
      // Parent hook surfaces the error message
    }
  }

  return (
    <form className="card form-card" onSubmit={handleSubmit}>
      <div className="card-header">
        <div>
          <h2>{mode === 'create' ? 'Add holding' : 'Edit holding'}</h2>
          <p className="muted">
            Enter ISIN, quantity, and your cost price. Security name and latest market price are
            fetched automatically.
          </p>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>ISIN</span>
          <input
            type="text"
            name="isin"
            placeholder="e.g. US0378331005"
            value={form.isin}
            onChange={(e) => setForm((prev) => ({ ...prev, isin: e.target.value.toUpperCase() }))}
            maxLength={12}
            autoComplete="off"
            disabled={isLoading}
            required
          />
        </label>

        <label className="field">
          <span>Holdings (quantity)</span>
          <input
            type="number"
            name="holdings"
            placeholder="e.g. 100"
            min="0"
            step="any"
            value={form.holdings}
            onChange={(e) => setForm((prev) => ({ ...prev, holdings: e.target.value }))}
            disabled={isLoading}
            required
          />
        </label>

        <label className="field">
          <span>Cost price</span>
          <input
            type="number"
            name="costPrice"
            placeholder="e.g. 150.25"
            min="0"
            step="any"
            value={form.costPrice}
            onChange={(e) => setForm((prev) => ({ ...prev, costPrice: e.target.value }))}
            disabled={isLoading}
            required
          />
        </label>
      </div>

      {localError && <div className="banner error">{localError}</div>}

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={isLoading}>
          {isLoading ? 'Saving…' : mode === 'create' ? 'Save holding' : 'Update holding'}
        </button>

        {mode === 'edit' && onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel} disabled={isLoading}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
