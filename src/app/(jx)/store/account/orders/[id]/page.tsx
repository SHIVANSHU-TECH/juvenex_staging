import type { Metadata } from 'next'
import Link from 'next/link'
import { OrderDetail } from '@/components/jx/account/OrderDetail'
import s from '@/components/jx/account/portal.module.css'

export const metadata: Metadata = { title:'Order details', robots:{index:false,follow:false} }
export default async function OrderPage({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <div className={`jx-shell ${s.page}`}><nav className={s.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/store/account/orders">My orders</Link><span aria-hidden="true">/</span><span aria-current="page">#{id}</span></nav><header className={s.heading}><div><span className="jx-eyebrow">Member portal</span><h1 className="jx-display">Order #{id}</h1><p>Manage your delivery, subscription, and secure care messages.</p></div></header><OrderDetail orderId={id}/></div> }
