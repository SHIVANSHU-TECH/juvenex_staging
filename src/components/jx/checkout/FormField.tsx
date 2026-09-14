'use client'

/**
 * Labelled text input with the accessibility wiring the brief requires on
 * every field: a real `<label>`, `aria-invalid`, and the error message tied
 * in with `aria-describedby`. Shared by every text-ish field in the checkout
 * form so that wiring only has to be right once.
 */
import { useId, type InputHTMLAttributes } from 'react'

interface FormFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange' | 'value'> {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  /** Extra hint shown under the label even when there's no error, e.g. "Must match your account email." */
  hint?: string
}

export function FormField({ label, value, onChange, error, hint, style, ...rest }: FormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--jx-ink)' }}>
        {label}
        {rest.required ? (
          <span aria-hidden="true" style={{ color: '#b3261e' }}>
            {' '}
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        className="jx-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        style={style}
        {...rest}
      />
      {hint ? (
        <p id={hintId} style={{ margin: 0, fontSize: 12, color: 'var(--jx-muted)' }}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" style={{ margin: 0, fontSize: 12, color: '#b3261e' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  error?: string
  required?: boolean
  autoComplete?: string
  placeholder?: string
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  required,
  autoComplete,
  placeholder,
}: SelectFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, color: 'var(--jx-ink)' }}>
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: '#b3261e' }}>
            {' '}
            *
          </span>
        ) : null}
      </label>
      <select
        id={id}
        className="jx-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete={autoComplete}
        required={required}
      >
        <option value="" disabled>
          {placeholder ?? 'Select…'}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" style={{ margin: 0, fontSize: 12, color: '#b3261e' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
