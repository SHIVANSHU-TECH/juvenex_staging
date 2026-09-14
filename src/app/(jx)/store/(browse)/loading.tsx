import s from '@/components/jx/store/store.module.css'

/** Lightweight skeleton for the static /store index only (not product PDPs). */
export default function StoreLoading() {
  return (
    <div className="jx-shell" style={{ paddingBlock: '26px 64px' }} aria-busy="true" aria-label="Loading shop">
      <div className="jx-skeleton" style={{ width: 120, height: 12, borderRadius: 6 }} />
      <div
        className="jx-skeleton"
        style={{ width: 'min(420px, 80%)', height: 44, borderRadius: 10, margin: '18px 0 12px' }}
      />
      <div className="jx-skeleton" style={{ width: 'min(620px, 100%)', height: 12, borderRadius: 6 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
        {[0, 1, 2, 3, 4].map((pill) => (
          <div
            key={pill}
            className="jx-skeleton"
            style={{ width: 76 + pill * 10, height: 36, borderRadius: 999 }}
          />
        ))}
      </div>
      <div className={s.grid} style={{ marginTop: 22 }} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={s.skelCard}>
            <div className={`jx-skeleton ${s.skelArt}`} />
            <div className={`jx-skeleton ${s.skelLine}`} style={{ width: '62%' }} />
            <div className={`jx-skeleton ${s.skelLine}`} style={{ width: '80%' }} />
            <div className={`jx-skeleton ${s.skelLine}`} style={{ width: '40%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
