// Pure helpers for the product overrides table — no React, no DOM.
// Kept in their own module so the table component stays under the
// 400-line budget in coding-style.md.

import type { Override } from '@/lib/api/productOverrides';

const PROXIED_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  'prescribe-rx-product-assets.s3.amazonaws.com',
]);

function base64UrlEncode(input: string): string {
  if (typeof window === 'undefined') return '';
  const b64 = window.btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Route an upstream product image through `/api/img/...` if it's hosted on
 * an allow-listed proxied host. Same-origin and unknown hosts pass through
 * (the latter return null so the row falls back to a placeholder block).
 */
export function proxyImageUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (PROXIED_IMAGE_HOSTS.has(parsed.hostname)) {
    return `/api/img/${base64UrlEncode(rawUrl)}`;
  }
  return rawUrl;
}

export function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type ParsedPrice =
  | { ok: true; cents: number | null }
  | { ok: false };

export function parsePriceDraft(raw: string): ParsedPrice {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, cents: null };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false };
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(cents) || cents < 0) return { ok: false };
  return { ok: true, cents };
}

export function centsToDraft(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Override map reducer.
// ---------------------------------------------------------------------------

export type OverrideMap = Map<string, Override>;

export type OverrideAction =
  | { type: 'replace_all'; rows: Override[] }
  | { type: 'set'; productId: string; override: Override }
  | { type: 'remove'; productId: string };

export function reduceOverrides(
  state: OverrideMap,
  action: OverrideAction
): OverrideMap {
  switch (action.type) {
    case 'replace_all': {
      const next = new Map<string, Override>();
      for (const row of action.rows) next.set(row.product_id, row);
      return next;
    }
    case 'set': {
      const next = new Map(state);
      next.set(action.productId, action.override);
      return next;
    }
    case 'remove': {
      const next = new Map(state);
      next.delete(action.productId);
      return next;
    }
  }
}

// ---------------------------------------------------------------------------
// Layout constants — exported so subcomponents agree on the row geometry.
// ---------------------------------------------------------------------------

export const ROW_HEIGHT = 60;
export const VIEWPORT_HEIGHT = 600;
export const OVERSCAN = 6;
export const ROW_GRID_COLS =
  'grid-cols-[44px_56px_minmax(0,2.5fr)_minmax(0,1fr)_96px_72px_120px_88px]';
