// Search + filter + bulk-action toolbar for the product overrides table.

'use client';

import { useId } from 'react';

export interface ToolbarRowProps {
  search: string;
  onSearchChange: (next: string) => void;
  category: string;
  onCategoryChange: (next: string) => void;
  categories: ReadonlyArray<string>;
  selectedCount: number;
  totalRows: number;
  onBulkInclude: () => void;
  onBulkExclude: () => void;
  onClearSelection: () => void;
  onExportCsv: () => void;
  onImportCsvClick: () => void;
}

const PRIMARY_BUTTON =
  'px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--accent-strong)] hover:bg-[#4D6841] disabled:bg-[#B5C2AE] disabled:cursor-not-allowed';
const SECONDARY_BUTTON =
  'px-3 py-1.5 rounded-lg text-xs font-semibold text-[#2D352C] bg-white border border-[#E5EAE3] hover:border-[var(--accent)]/60 hover:bg-[#FAF9F6] disabled:opacity-50 disabled:cursor-not-allowed';
const DESTRUCTIVE_BUTTON =
  'px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed';

export function ToolbarRow({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories,
  selectedCount,
  totalRows,
  onBulkInclude,
  onBulkExclude,
  onClearSelection,
  onExportCsv,
  onImportCsvClick,
}: ToolbarRowProps) {
  const searchId = useId();
  const categoryId = useId();
  const hasSelection = selectedCount > 0;

  return (
    <div className="bg-white border border-[#E5EAE3] rounded-2xl shadow-sm p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col sm:flex-row gap-2 flex-1 min-w-0">
        <div className="relative flex-1 min-w-0">
          <label htmlFor={searchId} className="sr-only">
            Search products
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or category…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 text-[#2D352C] placeholder:text-[#8B9B83]"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B9B83]"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
            />
          </svg>
        </div>

        <label htmlFor={categoryId} className="sr-only">
          Filter by category
        </label>
        <select
          id={categoryId}
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-[#E5EAE3] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 text-[#2D352C] sm:max-w-[200px]"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs text-[#6B7567]"
          aria-live="polite"
          aria-atomic="true"
        >
          {hasSelection
            ? `${selectedCount} selected`
            : `${totalRows} product${totalRows === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={onBulkInclude}
          disabled={!hasSelection}
          className={PRIMARY_BUTTON}
        >
          Include selected
        </button>
        <button
          type="button"
          onClick={onBulkExclude}
          disabled={!hasSelection}
          className={DESTRUCTIVE_BUTTON}
        >
          Exclude selected
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={!hasSelection}
          className={SECONDARY_BUTTON}
        >
          Clear
        </button>
        <span className="hidden sm:block w-px h-5 bg-[#E5EAE3]" aria-hidden="true" />
        <button
          type="button"
          onClick={onExportCsv}
          className={SECONDARY_BUTTON}
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={onImportCsvClick}
          className={SECONDARY_BUTTON}
        >
          Import CSV
        </button>
      </div>
    </div>
  );
}
