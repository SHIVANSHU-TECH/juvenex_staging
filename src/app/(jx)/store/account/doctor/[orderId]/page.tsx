import type { Metadata } from 'next'
import Link from 'next/link'
import { DoctorChatThread } from '@/components/jx/account/DoctorChatThread'
import s from '@/components/jx/account/portal.module.css'

export const metadata: Metadata = {
  title: 'Talk to Doctor',
  robots: { index: false, follow: false },
}

export default async function DoctorOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  return (
    <div className={`jx-shell ${s.page}`}>
      <nav className={s.breadcrumb} aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/store/account/doctor">Talk to My Doctor</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">#{orderId}</span>
      </nav>
      <header className={s.heading}>
        <div>
          <span className="jx-eyebrow">Secure chat</span>
          <h1 className="jx-display">Order #{orderId}</h1>
          <p>Message your doctor about this treatment order.</p>
        </div>
      </header>
      <DoctorChatThread orderId={orderId} />
    </div>
  )
}
