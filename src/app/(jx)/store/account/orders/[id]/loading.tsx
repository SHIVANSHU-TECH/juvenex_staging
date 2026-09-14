import s from '@/components/jx/account/portal.module.css'
export default function Loading(){return <div className={`jx-shell ${s.page}`} aria-busy="true"><div className={s.skeleton}/><div style={{height:14}}/><div className={s.skeleton}/></div>}
