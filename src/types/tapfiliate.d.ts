// Global typing for the Tapfiliate client-side command queue.
//
// The tracking snippet (see src/components/TapfiliateScript.tsx) installs
// `window.tap` as a small queue stub *before* the external tapfiliate.js loads,
// so calls like `tap('detect')` / `tap('conversion', id, amount)` are always
// safe — they push onto `tap.q` until the real library drains it. This means
// `window.tap` is callable even if the script is blocked/unavailable.

/** The `tap()` command function, with the bootstrap queue it buffers into. */
type TapfiliateFn = ((...args: unknown[]) => void) & {
  /** Pending calls buffered before tapfiliate.js loads. */
  q?: unknown[][];
};

declare global {
  interface Window {
    /** Tapfiliate command queue/dispatcher. Undefined until the snippet runs. */
    tap?: TapfiliateFn;
    /** Name of the global Tapfiliate object (always `'tap'` here). */
    TapfiliateObject?: string;
  }
}

export {};
