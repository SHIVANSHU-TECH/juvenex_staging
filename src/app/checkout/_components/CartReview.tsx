'use client';

import Link from 'next/link';
import { cartSubtotalCents, formatUsd } from './cart';
import type { CartLineItem } from './types';
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CARD_CLASS,
} from './ui';

interface CartReviewProps {
  items: ReadonlyArray<CartLineItem>;
  onContinue: () => void;
}

export default function CartReview({ items, onContinue }: CartReviewProps) {
  const subtotal = cartSubtotalCents(items);

  if (items.length === 0) {
    return (
      <div className={SECTION_CARD_CLASS}>
        <h2 className="text-lg font-bold text-[#2D352C] mb-2">Your cart is empty</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Add medications or supplies to your cart to continue.
        </p>
        <Link
          href="/shop"
          className={`${PRIMARY_BUTTON_CLASS} inline-flex items-center justify-center px-6`}
        >
          Browse shop
        </Link>
      </div>
    );
  }

  return (
    <div className={SECTION_CARD_CLASS}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-[#2D352C]">Review your cart</h2>
        <Link
          href="/shop"
          className="text-sm font-medium text-[var(--accent-strong)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 rounded"
        >
          Edit cart
        </Link>
      </div>

      <ul className="space-y-3 mb-5 list-none p-0">
        {items.map((item) => (
          <li
            key={item.cartId}
            className="flex items-start justify-between gap-3 pb-3 border-b border-[#EEF1ED] last:border-b-0 last:pb-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#2D352C] truncate">
                {item.name}
                {item.plan_label && (
                  <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">
                    ({item.plan_label})
                  </span>
                )}
              </p>
              {item.category ? (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.category}</p>
              ) : null}
            </div>
            <span className="text-sm font-semibold text-[#2D352C] whitespace-nowrap">
              {formatUsd(item.price_cents)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="space-y-2 mb-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-[var(--text-muted)]">Subtotal</dt>
          <dd className="text-[#2D352C] font-medium">{formatUsd(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--text-muted)]">Shipping</dt>
          <dd className="text-[#2D352C] font-medium">Calculated at checkout</dd>
        </div>
      </dl>

      <div className="flex justify-between pt-3 border-t border-[#E5EAE3] mb-6">
        <span className="text-base font-semibold text-[#2D352C]">Estimated total</span>
        <span className="text-xl font-bold text-[var(--accent-strong)]">
          {formatUsd(subtotal)}
        </span>
      </div>

      <div className="flex gap-3">
        <Link
          href="/shop"
          className={`${SECONDARY_BUTTON_CLASS} inline-flex items-center justify-center`}
        >
          Back to shop
        </Link>
        <button type="button" onClick={onContinue} className={PRIMARY_BUTTON_CLASS}>
          Continue to shipping
        </button>
      </div>
    </div>
  );
}
