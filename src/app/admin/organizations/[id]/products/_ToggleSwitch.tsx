// Accessible on/off toggle switch.
//
// role="switch" + aria-checked is the canonical ARIA pattern for a binary
// state control where the label sits outside the widget. Space and Enter
// flip the state; the change handler is debounced upstream by the table.

'use client';

import { useCallback, type KeyboardEvent } from 'react';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  describedById?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  describedById,
}: ToggleSwitchProps) {
  const handleClick = useCallback(() => {
    if (disabled) return;
    onChange(!checked);
  }, [checked, disabled, onChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      // role="switch" should respond to Space; we also accept Enter for
      // consistency with native button activation.
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedById}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-[var(--accent-strong)]' : 'bg-[#D6DBD2]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
