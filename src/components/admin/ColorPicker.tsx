'use client';

import { useId } from 'react';

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Optional id for the custom hex input — useful for label association. */
  inputId?: string;
}

/** Brand-friendly default swatches (sage first). */
export const DEFAULT_SWATCHES: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: '#8FA888', label: 'Sage' },
  { hex: '#2D352C', label: 'Forest' },
  { hex: '#5B7B7A', label: 'Teal' },
  { hex: '#3B82F6', label: 'Blue' },
  { hex: '#8B5CF6', label: 'Violet' },
  { hex: '#EC4899', label: 'Pink' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#EF4444', label: 'Red' },
  { hex: '#0F172A', label: 'Slate' },
  { hex: '#FAF9F6', label: 'Cream' },
];

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value: string): boolean {
  return HEX_REGEX.test(value);
}

/**
 * Swatch picker for selecting a brand primary color. Includes a manual
 * hex input for custom colors. Returns the chosen color via `onChange`.
 */
export default function ColorPicker({ value, onChange, inputId }: ColorPickerProps) {
  const fallbackId = useId();
  const id = inputId ?? fallbackId;
  const normalized = value.toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Primary color">
        {DEFAULT_SWATCHES.map((swatch) => {
          const selected = swatch.hex.toLowerCase() === normalized;
          return (
            <button
              key={swatch.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${swatch.label} (${swatch.hex})`}
              onClick={() => onChange(swatch.hex)}
              className={`w-9 h-9 rounded-lg border transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent)] ${
                selected
                  ? 'ring-2 ring-offset-2 ring-[var(--accent)] border-[var(--accent)]'
                  : 'border-[#E5EAE3]'
              }`}
              style={{ backgroundColor: swatch.hex }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label
          htmlFor={id}
          className="text-xs font-medium text-[#2D352C]/60 whitespace-nowrap"
        >
          Custom hex
        </label>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#8FA888"
          maxLength={7}
          className={`flex-1 px-3 py-2 bg-white border rounded-lg text-sm text-[#2D352C] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
            value && !isValidHex(value)
              ? 'border-red-400'
              : 'border-[#E5EAE3]'
          }`}
        />
        <span
          className="w-9 h-9 rounded-lg border border-[#E5EAE3]"
          style={{ backgroundColor: isValidHex(value) ? value : '#FAF9F6' }}
          aria-hidden="true"
        />
      </div>
      {value && !isValidHex(value) && (
        <p className="text-xs text-red-600">
          Must be a 7-character hex like #8FA888.
        </p>
      )}
    </div>
  );
}
