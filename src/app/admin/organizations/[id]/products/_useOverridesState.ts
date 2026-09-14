// Custom hook for the product overrides table state machine.
//
// Owns:
//   - Catalog + override map load
//   - Price drafts (uncontrolled-style buffer the user is currently typing)
//   - Per-product saving spinners
//   - Debounced autosave for toggle (500ms) and price (800ms)
//   - Bulk PUT, CSV import re-sync
//
// Pulled out of ProductOverridesTable so that file stays focused on layout.
// Returns plain values + handlers so the table can render however it likes.

'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  clearOverride,
  fetchAllCatalog,
  fetchOverrides,
  importOverridesCsv,
  upsertOverrides,
  type CatalogProduct,
  type CsvRowResult,
  type Override,
  type OverrideUpsert,
} from '@/lib/api/productOverrides';
import {
  centsToDraft,
  parsePriceDraft,
  reduceOverrides,
  type OverrideMap,
} from './_helpers';

export interface ToastState {
  message: string;
  tone: 'success' | 'error';
}

export interface UseOverridesStateResult {
  catalog: CatalogProduct[];
  overrides: OverrideMap;
  priceDrafts: Map<string, string>;
  savingIds: Set<string>;
  isLoading: boolean;
  loadError: string | null;
  toast: ToastState | null;
  csvBusy: boolean;
  csvResults: CsvRowResult[] | null;
  csvError: string | null;
  loadAll: () => Promise<void>;
  setLoadError: (next: string | null) => void;
  setToast: (next: ToastState | null) => void;
  handleToggleIncluded: (productId: string, next: boolean) => void;
  handlePriceChange: (productId: string, raw: string) => void;
  runBulk: (productIds: ReadonlyArray<string>, included: boolean) => Promise<void>;
  importCsv: (file: File) => Promise<void>;
  resetCsvDialog: () => void;
}

const TOGGLE_DEBOUNCE_MS = 500;
const PRICE_DEBOUNCE_MS = 800;

export function useOverridesState(orgId: string): UseOverridesStateResult {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [overrides, dispatchOverrides] = useReducer(
    reduceOverrides,
    new Map<string, Override>()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Map<string, string>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResults, setCsvResults] = useState<CsvRowResult[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Per-product debounce timers — stored on refs so successive edits cancel
  // the previous pending PUT/DELETE for the same product.
  const toggleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const priceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Mirror current overrides + drafts on a ref so debounced timers always
  // see the freshest state without retriggering when those values change.
  const overridesRef = useRef(overrides);
  const draftsRef = useRef(priceDrafts);
  useEffect(() => {
    overridesRef.current = overrides;
  }, [overrides]);
  useEffect(() => {
    draftsRef.current = priceDrafts;
  }, [priceDrafts]);

  const showToast = useCallback(
    (message: string, tone: 'success' | 'error') =>
      setToast({ message, tone }),
    []
  );

  const markSaving = useCallback((productId: string, on: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const seedDraftsFrom = useCallback((rows: ReadonlyArray<Override>) => {
    const drafts = new Map<string, string>();
    for (const row of rows) {
      drafts.set(row.product_id, centsToDraft(row.price_override_cents));
    }
    setPriceDrafts(drafts);
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [cat, ov] = await Promise.all([
        fetchAllCatalog(),
        fetchOverrides(orgId),
      ]);
      setCatalog(cat);
      dispatchOverrides({ type: 'replace_all', rows: ov });
      seedDraftsFrom(ov);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, seedDraftsFrom]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Cancel any pending debounces on unmount so we don't fire stale PUTs.
  useEffect(() => {
    const toggle = toggleTimers.current;
    const price = priceTimers.current;
    return () => {
      for (const t of toggle.values()) clearTimeout(t);
      for (const t of price.values()) clearTimeout(t);
    };
  }, []);

  const persistOne = useCallback(
    async (
      productId: string,
      payload: OverrideUpsert,
      previous: Override | undefined
    ) => {
      markSaving(productId, true);
      try {
        await upsertOverrides(orgId, [payload]);
        const updated: Override = {
          product_id: productId,
          included: payload.included,
          price_override_cents: payload.price_override_cents ?? null,
          updated_at: new Date().toISOString(),
        };
        dispatchOverrides({ type: 'set', productId, override: updated });
      } catch (err) {
        // Revert optimistic flip on error so UI matches server state.
        if (previous) {
          dispatchOverrides({ type: 'set', productId, override: previous });
        } else {
          dispatchOverrides({ type: 'remove', productId });
        }
        showToast(
          err instanceof Error ? err.message : 'Failed to save change',
          'error'
        );
      } finally {
        markSaving(productId, false);
      }
    },
    [orgId, markSaving, showToast]
  );

  const handleToggleIncluded = useCallback(
    (productId: string, next: boolean) => {
      const previous = overridesRef.current.get(productId);
      const optimistic: Override = {
        product_id: productId,
        included: next,
        price_override_cents: previous?.price_override_cents ?? null,
        updated_at: new Date().toISOString(),
      };
      dispatchOverrides({ type: 'set', productId, override: optimistic });

      const existing = toggleTimers.current.get(productId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        toggleTimers.current.delete(productId);
        const draft = draftsRef.current.get(productId) ?? '';
        const parsed = parsePriceDraft(draft);
        const priceCents = parsed.ok
          ? parsed.cents
          : previous?.price_override_cents ?? null;
        void persistOne(
          productId,
          { product_id: productId, included: next, price_override_cents: priceCents },
          previous
        );
      }, TOGGLE_DEBOUNCE_MS);
      toggleTimers.current.set(productId, timer);
    },
    [persistOne]
  );

  const handlePriceChange = useCallback(
    (productId: string, raw: string) => {
      setPriceDrafts((prev) => {
        const next = new Map(prev);
        next.set(productId, raw);
        return next;
      });

      const existing = priceTimers.current.get(productId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(async () => {
        priceTimers.current.delete(productId);
        const previous = overridesRef.current.get(productId);
        const parsed = parsePriceDraft(raw);
        if (!parsed.ok) {
          showToast(
            'Price must be a positive number with up to 2 decimals',
            'error'
          );
          return;
        }
        // Empty draft → DELETE the override entirely.
        if (parsed.cents === null) {
          if (!previous) return;
          markSaving(productId, true);
          try {
            await clearOverride(orgId, productId);
            dispatchOverrides({ type: 'remove', productId });
          } catch (err) {
            showToast(
              err instanceof Error ? err.message : 'Failed to clear override',
              'error'
            );
          } finally {
            markSaving(productId, false);
          }
          return;
        }
        const included = previous?.included ?? true;
        void persistOne(
          productId,
          {
            product_id: productId,
            included,
            price_override_cents: parsed.cents,
          },
          previous
        );
      }, PRICE_DEBOUNCE_MS);
      priceTimers.current.set(productId, timer);
    },
    [orgId, markSaving, persistOne, showToast]
  );

  const runBulk = useCallback(
    async (productIds: ReadonlyArray<string>, included: boolean) => {
      if (productIds.length === 0) return;
      const previousMap = new Map<string, Override | undefined>();
      const updates: OverrideUpsert[] = [];
      const now = new Date().toISOString();
      for (const id of productIds) {
        const prev = overridesRef.current.get(id);
        previousMap.set(id, prev);
        const optimistic: Override = {
          product_id: id,
          included,
          price_override_cents: prev?.price_override_cents ?? null,
          updated_at: now,
        };
        dispatchOverrides({ type: 'set', productId: id, override: optimistic });
        updates.push({
          product_id: id,
          included,
          price_override_cents: prev?.price_override_cents ?? null,
        });
      }
      try {
        const res = await upsertOverrides(orgId, updates);
        showToast(`Updated ${res.upserted_count} products`, 'success');
      } catch (err) {
        for (const id of productIds) {
          const prev = previousMap.get(id);
          if (prev) dispatchOverrides({ type: 'set', productId: id, override: prev });
          else dispatchOverrides({ type: 'remove', productId: id });
        }
        showToast(
          err instanceof Error ? err.message : 'Bulk update failed',
          'error'
        );
      }
    },
    [orgId, showToast]
  );

  const importCsv = useCallback(
    async (file: File) => {
      setCsvBusy(true);
      setCsvError(null);
      setCsvResults(null);
      try {
        const result = await importOverridesCsv(orgId, file);
        setCsvResults(result.rows);
        const ok = result.rows.filter((r) => r.status === 'ok').length;
        showToast(`Imported ${ok} rows`, 'success');
        // Re-sync from server so the table reflects what was saved.
        const fresh = await fetchOverrides(orgId);
        dispatchOverrides({ type: 'replace_all', rows: fresh });
        seedDraftsFrom(fresh);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Import failed');
      } finally {
        setCsvBusy(false);
      }
    },
    [orgId, seedDraftsFrom, showToast]
  );

  const resetCsvDialog = useCallback(() => {
    setCsvResults(null);
    setCsvError(null);
  }, []);

  return {
    catalog,
    overrides,
    priceDrafts,
    savingIds,
    isLoading,
    loadError,
    toast,
    csvBusy,
    csvResults,
    csvError,
    loadAll,
    setLoadError,
    setToast,
    handleToggleIncluded,
    handlePriceChange,
    runBulk,
    importCsv,
    resetCsvDialog,
  };
}
