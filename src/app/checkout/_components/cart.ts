import type { CartLineItem, CheckoutItem } from './types';

// IMPORTANT: shop/page.tsx persists the cart under 'glp-cart'. Keep these
// keys in lockstep — adding a second key would silently strand carts.
export const CART_STORAGE_KEY = 'glp-cart';

interface RawCartItem {
  id?: unknown;
  cartId?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  price_cents?: unknown;
  plan_months?: unknown;
  plan_label?: unknown;
  image_url?: unknown;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeItem(raw: RawCartItem): CartLineItem | null {
  const id = asString(raw.id);
  if (!id) return null;
  const price = asNumber(raw.price);
  const priceCents =
    asNumber(raw.price_cents) || Math.round(price * 100);
  return {
    id,
    cartId: asString(raw.cartId, `${id}-${Date.now()}`),
    name: asString(raw.name, 'Product'),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    category: asString(raw.category, 'Other'),
    price,
    price_cents: priceCents,
    plan_months: asNumber(raw.plan_months, 1) === 3 ? 3 : 1,
    plan_label: asString(raw.plan_label, '1 month'),
    image_url: typeof raw.image_url === 'string' ? raw.image_url : undefined,
  };
}

export function loadCart(): CartLineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeItem(row as RawCartItem))
      .filter((item): item is CartLineItem => item !== null);
  } catch {
    return [];
  }
}

export function clearCart(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // localStorage unavailable — ignore.
  }
}

// Collapse repeated cart entries into one CheckoutItem per product + plan.
// A 3-month plan is sent as quantity=3 so the server's authoritative
// product price is still the source of truth.
export function aggregateForCheckout(items: ReadonlyArray<CartLineItem>): CheckoutItem[] {
  const byProductId = new Map<string, CheckoutItem>();
  for (const item of items) {
    const months = item.plan_months ?? 1;
    const key = `${item.id}:${months}`;
    const existing = byProductId.get(key);
    if (existing) {
      byProductId.set(key, {
        ...existing,
        quantity: existing.quantity + months,
      });
      continue;
    }
    byProductId.set(key, {
      product_id: item.id,
      name: months > 1 ? `${item.name} (${months} months)` : item.name,
      quantity: months,
      price_cents: Math.round(item.price_cents / months),
    });
  }
  return Array.from(byProductId.values());
}

export function cartSubtotalCents(items: ReadonlyArray<CartLineItem>): number {
  return items.reduce((sum, item) => sum + item.price_cents, 0);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
