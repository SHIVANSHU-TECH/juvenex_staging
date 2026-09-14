import s from '@/components/jx/store/store.module.css'

/** Mirrors the detail layout so the price block does not jump when it lands. */
export default function ProductLoading() {
  return (
    <div className="jx-shell" style={{ paddingBlock: '22px 64px' }}>
      <div className="jx-skeleton" style={{ width: 210, height: 11, borderRadius: 6, marginBottom: 22 }} />

      <div className={s.detail}>
        <div className={`jx-card ${s.artwork}`} aria-hidden="true">
          <div className="jx-skeleton" style={{ width: 250, height: 300, borderRadius: 14 }} />
        </div>

        <div>
          <div className="jx-skeleton" style={{ width: 180, height: 10, borderRadius: 5 }} />
          <div
            className="jx-skeleton"
            style={{ width: 'min(340px, 90%)', height: 40, borderRadius: 10, margin: '16px 0 12px' }}
          />
          <div className="jx-skeleton" style={{ width: 220, height: 12, borderRadius: 6 }} />
          <div
            className="jx-skeleton"
            style={{ width: 150, height: 32, borderRadius: 8, margin: '22px 0 18px' }}
          />
          <div className="jx-skeleton" style={{ width: '100%', maxWidth: 340, height: 44, borderRadius: 999 }} />
          <div
            className="jx-skeleton"
            style={{ width: '100%', height: 92, borderRadius: 16, marginTop: 22 }}
          />
        </div>
      </div>

      <div className="jx-skeleton" style={{ width: 210, height: 22, borderRadius: 8, margin: '38px 0 14px' }} />
      <ul className={s.optionGrid}>
        {[0, 1, 2, 3].map((index) => (
          <li key={index}>
            <div className="jx-skeleton" style={{ height: 96, borderRadius: 12 }} />
          </li>
        ))}
      </ul>

      <p className="jx-sr" role="status">
        Loading this product.
      </p>
    </div>
  )
}
