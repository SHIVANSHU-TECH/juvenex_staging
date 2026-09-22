import type { Metadata } from 'next'
import Link from 'next/link'
import { DoctorChatList } from '@/components/jx/account/DoctorChatList'
import s from '@/components/jx/account/portal.module.css'

export const metadata: Metadata = {
  title: 'Talk to My Doctor',
  robots: { index: false, follow: false },
}

export default function DoctorChatPage() {
  return (
    <div className={`jx-shell ${s.page}`}>
      <nav className={s.breadcrumb} aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/store/account/orders">Member portal</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Talk to My Doctor</span>
      </nav>
      <header className={s.heading}>
        <div>
          <span className="jx-eyebrow">Member portal</span>
          <h1 className="jx-display">Talk to My Doctor</h1>
          <p>Choose an order to open a secure chat with your prescribing doctor.</p>
        </div>
      </header>
      <DoctorChatList />
    </div>
  )
}
