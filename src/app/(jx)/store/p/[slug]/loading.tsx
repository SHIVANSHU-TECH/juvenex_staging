/**
 * Lightweight PDP skeleton — must NOT reuse store/loading.tsx (that one implies
 * a partner catalogue fetch and wraps the whole /store segment).
 */
export default function FamilyProductLoading() {
  return (
    <div className="jx-shell" style={{ paddingBlock: '22px 64px' }} aria-busy="true" aria-label="Loading product">
      <div className="jx-skeleton" style={{ width: 160, height: 12, borderRadius: 6, marginBottom: 18 }} />
      <div className="jx-card" style={{ padding: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div className="jx-skeleton" style={{ width: 160, height: 168, borderRadius: 12 }} />
        <div style={{ flex: '1 1 240px' }}>
          <div className="jx-skeleton" style={{ width: 100, height: 10, borderRadius: 5 }} />
          <div
            className="jx-skeleton"
            style={{ width: 'min(280px, 70%)', height: 32, borderRadius: 8, margin: '12px 0' }}
          />
          <div className="jx-skeleton" style={{ width: '90%', height: 12, borderRadius: 6 }} />
          <div className="jx-skeleton" style={{ width: '70%', height: 12, borderRadius: 6, marginTop: 8 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="jx-skeleton" style={{ height: 88, borderRadius: 12 }} />
        ))}
      </div>
    </div>
  )
}
