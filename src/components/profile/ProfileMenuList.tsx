'use client'

import Link from 'next/link'

export default function ProfileMenuList() {
  return (
    <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden">
      <Link
        href="/telehealth"
        className="flex items-center gap-4 p-4 border-b border-[#E5EAE3] hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      >
        <div className="w-10 h-10 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-xl">
          &#x1F4F9;
        </div>
        <div className="flex-1">
          <p className="font-medium text-[#2D352C]">My Consultations</p>
        </div>
        <span className="text-[#8B9B83]" aria-hidden="true">&rarr;</span>
      </Link>
      <Link
        href="/settings/payment-methods"
        className="flex items-center gap-4 p-4 border-b border-[#E5EAE3] hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      >
        <div className="w-10 h-10 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-xl">
          &#x1F4B3;
        </div>
        <div className="flex-1">
          <p className="font-medium text-[#2D352C]">Payment Methods</p>
        </div>
        <span className="text-[#8B9B83]" aria-hidden="true">&rarr;</span>
      </Link>
      <Link
        href="/settings"
        className="flex items-center gap-4 p-4 hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      >
        <div className="w-10 h-10 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-xl">
          &#x2699;&#xFE0F;
        </div>
        <div className="flex-1">
          <p className="font-medium text-[#2D352C]">Settings</p>
        </div>
        <span className="text-[#8B9B83]" aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
