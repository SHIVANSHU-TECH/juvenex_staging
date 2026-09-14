// Modal for uploading a CSV of product overrides and reviewing per-row results.
//
// Mirrors the focus-trap + Esc-to-close + role="dialog" pattern from
// EditBrandingModal so admin modals feel consistent.

'use client';

import { useEffect, useRef, useState } from 'react';
import type { CsvRowResult } from '@/lib/api/productOverrides';

interface CsvImportModalProps {
  open: boolean;
  busy: boolean;
  results: CsvRowResult[] | null;
  error: string | null;
  onClose: () => void;
  onSubmit: (file: File) => void;
}

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2MB sanity cap; backend enforces too.

export function CsvImportModal({
  open,
  busy,
  results,
  error,
  onClose,
  onSubmit,
}: CsvImportModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);

  // Reset transient state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setLocalError(null);
      setPicked(null);
      const t = setTimeout(() => fileInputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Focus trap — Tab cycles within the dialog.
  useEffect(() => {
    if (!open) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open) return null;

  const handlePick = (file: File | null) => {
    setLocalError(null);
    if (!file) {
      setPicked(null);
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setLocalError('File is larger than 2MB. Please split it and retry.');
      setPicked(null);
      return;
    }
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setLocalError('Please choose a .csv file.');
      setPicked(null);
      return;
    }
    setPicked(file);
  };

  const handleSubmit = () => {
    if (!picked) {
      setLocalError('Choose a CSV file first.');
      return;
    }
    onSubmit(picked);
  };

  const errorRows = results?.filter((r) => r.status === 'error') ?? [];
  const okCount = results
    ? results.filter((r) => r.status === 'ok').length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-import-title"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
      >
        <header className="flex items-center justify-between px-6 py-5 border-b border-[#E5EAE3]">
          <div>
            <h2 id="csv-import-title" className="text-lg font-bold text-[#2D352C]">
              Import overrides from CSV
            </h2>
            <p className="text-xs text-[#2D352C]/60 mt-0.5">
              Columns: product_id, included (true/false), price_override_cents
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className="p-2 rounded-lg text-[#2D352C]/60 hover:bg-[#FAF9F6] hover:text-[#2D352C]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-[#2D352C]/70 mb-1">
              CSV file
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[#2D352C] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#E5EAE3] file:bg-white file:text-xs file:font-semibold file:text-[#2D352C] hover:file:bg-[#FAF9F6]"
            />
          </label>

          {(localError || error) && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {localError ?? error}
            </p>
          )}

          {results && (
            <div className="border border-[#E5EAE3] rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-[#FAF9F6] border-b border-[#E5EAE3] text-xs text-[#2D352C] flex items-center justify-between">
                <span>
                  <strong>{okCount}</strong> rows imported,
                  <strong className="ml-1">{errorRows.length}</strong> failed
                </span>
                <span className="text-[#8B9B83]">{results.length} total</span>
              </div>
              {errorRows.length > 0 ? (
                <ul className="divide-y divide-[#E5EAE3] max-h-56 overflow-y-auto">
                  {errorRows.map((r) => (
                    <li
                      key={r.row}
                      className="px-3 py-2 text-xs text-red-700 flex gap-2"
                    >
                      <span className="font-mono text-[#8B9B83] flex-shrink-0">
                        Row {r.row}
                      </span>
                      <span className="break-words">{r.error ?? 'Unknown error'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-3 text-xs text-[#6B7567]">
                  All rows imported successfully.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#E5EAE3] bg-[#FAF9F6]/40">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm text-[#2D352C]/70 hover:bg-white hover:text-[#2D352C] disabled:opacity-50"
          >
            {results ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !picked}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--accent-strong)] hover:bg-[#4D6841] disabled:bg-[#B5C2AE] disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {busy && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="animate-spin w-4 h-4"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeOpacity="0.3"
                  strokeWidth="3"
                />
                <path
                  d="M22 12a10 10 0 00-10-10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {busy ? 'Importing…' : 'Upload'}
          </button>
        </footer>
      </div>
    </div>
  );
}
