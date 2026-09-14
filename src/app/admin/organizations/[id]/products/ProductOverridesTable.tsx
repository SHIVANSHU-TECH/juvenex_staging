'use client';

// Per-tenant product overrides table.
//
// Layout container only — data, autosave, and CSV plumbing live in
// useOverridesState (./_useOverridesState). This file owns local UI state
// (search, category filter, selection set, scroll position) and renders
// the toolbar, virtualized row list, modal, and toast.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  OVERSCAN,
  ROW_HEIGHT,
  VIEWPORT_HEIGHT,
  centsToDraft,
  csvEscape,
  proxyImageUrl,
} from './_helpers';
import {
  CsvImportModal,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  TableRow,
  Toast,
  ToolbarRow,
} from './_subcomponents';
import { useOverridesState } from './_useOverridesState';

interface ProductOverridesTableProps {
  orgId: string;
}

export default function ProductOverridesTable({
  orgId,
}: ProductOverridesTableProps) {
  const state = useOverridesState(orgId);

  // ---------- UI-only local state ----------------------------------------

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [csvOpen, setCsvOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // ---------- Derived data -----------------------------------------------

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of state.catalog) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [state.catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.catalog.filter((p) => {
      if (category && p.category !== category) return false;
      if (q.length === 0) return true;
      return `${p.name} ${p.category}`.toLowerCase().includes(q);
    });
  }, [state.catalog, search, category]);

  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filtered.length,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN
  );
  const visibleRows = filtered.slice(startIndex, endIndex);

  // ---------- Selection + bulk -------------------------------------------

  const toggleSelected = useCallback((productId: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleBulk = useCallback(
    (included: boolean) => {
      void state.runBulk(Array.from(selected), included);
    },
    [selected, state]
  );

  // ---------- CSV export (client-side) ----------------------------------

  const handleExportCsv = useCallback(() => {
    const header = 'product_id,product_name,included,price_override_cents';
    const lines = [header];
    for (const o of state.overrides.values()) {
      const product = state.catalog.find((p) => p.id === o.product_id);
      lines.push(
        [
          csvEscape(o.product_id),
          csvEscape(product?.name ?? ''),
          csvEscape(String(o.included)),
          csvEscape(o.price_override_cents),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overrides-${orgId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.overrides, state.catalog, orgId]);

  const handleCsvSubmit = useCallback(
    (file: File) => {
      void state.importCsv(file);
    },
    [state]
  );

  const closeCsvDialog = useCallback(() => {
    setCsvOpen(false);
    state.resetCsvDialog();
  }, [state]);

  // ---------- Render ------------------------------------------------------

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-[#2D352C]">
          Product overrides
        </h1>
        <p className="text-sm text-[#6B7567] mt-1">
          Toggle products on or off and set per-tenant price overrides.
          Changes save automatically.
        </p>
      </header>

      {state.loadError && (
        <ErrorBanner
          message={state.loadError}
          onRetry={state.loadAll}
          onDismiss={() => state.setLoadError(null)}
        />
      )}

      <ToolbarRow
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        categories={categories}
        selectedCount={selected.size}
        totalRows={filtered.length}
        onBulkInclude={() => handleBulk(true)}
        onBulkExclude={() => handleBulk(false)}
        onClearSelection={clearSelection}
        onExportCsv={handleExportCsv}
        onImportCsvClick={() => setCsvOpen(true)}
      />

      <div
        role="table"
        aria-label="Product overrides"
        aria-rowcount={filtered.length}
        className="bg-white border border-[#E5EAE3] rounded-2xl shadow-sm overflow-hidden"
      >
        <div
          role="row"
          className="grid grid-cols-[44px_56px_minmax(0,2.5fr)_minmax(0,1fr)_96px_72px_120px_88px] items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-[#8B9B83] bg-[#FAF9F6] border-b border-[#E5EAE3]"
        >
          <span role="columnheader" className="sr-only">Select</span>
          <span role="columnheader" className="sr-only">Image</span>
          <span role="columnheader">Product</span>
          <span role="columnheader">Category</span>
          <span role="columnheader">Upstream</span>
          <span role="columnheader" className="text-center">Included</span>
          <span role="columnheader">Price override</span>
          <span role="columnheader">Updated</span>
        </div>

        {state.isLoading ? (
          <SkeletonRows count={10} />
        ) : filtered.length === 0 ? (
          <EmptyState
            message={
              state.catalog.length === 0
                ? 'No products in the master catalog yet.'
                : 'No products match the current filters.'
            }
          />
        ) : (
          <div
            ref={scrollerRef}
            role="rowgroup"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            style={{
              height: VIEWPORT_HEIGHT,
              overflowY: 'auto',
              position: 'relative',
            }}
          >
            <div style={{ height: totalHeight, position: 'relative' }}>
              {visibleRows.map((product, i) => {
                const absoluteIndex = startIndex + i;
                const override = state.overrides.get(product.id);
                const draft =
                  state.priceDrafts.get(product.id) ??
                  centsToDraft(override?.price_override_cents ?? null);
                return (
                  <TableRow
                    key={product.id}
                    product={product}
                    override={override}
                    selected={selected.has(product.id)}
                    proxiedImageUrl={proxyImageUrl(product.image_url)}
                    onToggleSelect={toggleSelected}
                    onToggleIncluded={state.handleToggleIncluded}
                    onPriceChange={state.handlePriceChange}
                    priceDraft={draft}
                    saving={state.savingIds.has(product.id)}
                    rowTop={absoluteIndex * ROW_HEIGHT}
                    rowHeight={ROW_HEIGHT}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {state.toast && (
        <Toast
          message={state.toast.message}
          tone={state.toast.tone}
          onDismiss={() => state.setToast(null)}
        />
      )}

      <CsvImportModal
        open={csvOpen}
        onClose={closeCsvDialog}
        onSubmit={handleCsvSubmit}
        busy={state.csvBusy}
        results={state.csvResults}
        error={state.csvError}
      />
    </div>
  );
}
