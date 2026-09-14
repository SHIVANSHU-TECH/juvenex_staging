// One row in the virtualized product table.
//
// The row is absolutely positioned so the parent scroller can sum a fixed
// row height for every catalog item without rendering any of them. Only
// the visible slice from the table component actually mounts.

'use client';

import { useId } from 'react';
import type { CatalogProduct, Override } from '@/lib/api/productOverrides';
import { ROW_GRID_COLS } from './_helpers';
import { ToggleSwitch } from './_ToggleSwitch';

export interface TableRowProps {
  product: CatalogProduct;
  override: Override | undefined;
  selected: boolean;
  proxiedImageUrl: string | null;
  priceDraft: string;
  saving: boolean;
  rowTop: number;
  rowHeight: number;
  onToggleSelect: (productId: string, on: boolean) => void;
  onToggleIncluded: (productId: string, next: boolean) => void;
  onPriceChange: (productId: string, raw: string) => void;
}

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function TableRow({
  product,
  override,
  selected,
  proxiedImageUrl,
  priceDraft,
  saving,
  rowTop,
  rowHeight,
  onToggleSelect,
  onToggleIncluded,
  onPriceChange,
}: TableRowProps) {
  const priceInputId = useId();
  const included = override?.included ?? true;

  return (
    <div
      role="row"
      aria-selected={selected}
      style={{
        position: 'absolute',
        top: rowTop,
        left: 0,
        right: 0,
        height: rowHeight,
      }}
      className={`grid ${ROW_GRID_COLS} items-center gap-2 px-3 border-b border-[#E5EAE3] text-sm hover:bg-[#FAF9F6]/60 ${
        selected ? 'bg-[#F0F4ED]' : ''
      }`}
    >
      <div role="cell" className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggleSelect(product.id, e.target.checked)}
          aria-label={`Select ${product.name}`}
          className="w-4 h-4 rounded border-[#C9D2C2] text-[var(--accent-strong)] focus:ring-[var(--accent)]/40"
        />
      </div>

      <div role="cell" className="flex items-center justify-center">
        {proxiedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxiedImageUrl}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            className="w-10 h-10 rounded-lg object-cover bg-[#F0F4ED] border border-[#E5EAE3]"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-10 h-10 rounded-lg bg-[#F0F4ED] border border-[#E5EAE3]"
          />
        )}
      </div>

      <div role="cell" className="min-w-0">
        <p className="text-[#2D352C] font-medium truncate">{product.name}</p>
        <p className="text-[11px] text-[#8B9B83] font-mono truncate">
          {product.id}
        </p>
      </div>

      <div role="cell" className="min-w-0">
        <span className="inline-block px-2 py-0.5 rounded-md bg-[#F0F4ED] text-[11px] text-[var(--accent-strong)] truncate max-w-full">
          {product.category || '—'}
        </span>
      </div>

      <div role="cell" className="text-[#2D352C] tabular-nums">
        {formatCents(product.price_cents)}
      </div>

      <div role="cell" className="flex items-center justify-center">
        <ToggleSwitch
          checked={included}
          onChange={(next) => onToggleIncluded(product.id, next)}
          label={`${included ? 'Exclude' : 'Include'} ${product.name}`}
          disabled={saving}
        />
      </div>

      <div role="cell">
        <label htmlFor={priceInputId} className="sr-only">
          Price override for {product.name} in dollars
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[#8B9B83]"
          >
            $
          </span>
          <input
            id={priceInputId}
            type="text"
            inputMode="decimal"
            value={priceDraft}
            onChange={(e) => onPriceChange(product.id, e.target.value)}
            placeholder="—"
            aria-label={`Price override for ${product.name}`}
            className="w-full pl-5 pr-2 py-1 text-sm bg-white border border-[#E5EAE3] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 text-[#2D352C] tabular-nums"
          />
        </div>
      </div>

      <div role="cell" className="text-[11px] text-[#6B7567]">
        {saving ? (
          <span className="inline-flex items-center gap-1 text-[var(--accent-strong)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="animate-spin w-3 h-3"
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
            Saving
          </span>
        ) : (
          formatRelative(override?.updated_at)
        )}
      </div>
    </div>
  );
}
