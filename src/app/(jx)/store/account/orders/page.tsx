import type { Metadata } from 'next'
import Link from 'next/link'
import { OrdersList } from '@/components/jx/account/OrdersList'
import s from '@/components/jx/account/portal.module.css'

export const metadata: Metadata = { title: 'My orders', robots: { index:false, follow:false } }
export default function OrdersPage() {
  return <div className={`jx-shell ${s.page}`}>
    <nav className={s.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">My orders</span></nav>
    <header className={s.heading}><div><span className="jx-eyebrow">Member portal</span><h1 className="jx-display">My orders</h1><p>Track treatment progress, manage deliveries, and message your care team.</p></div></header>
    <OrdersList />
  </div>
}
