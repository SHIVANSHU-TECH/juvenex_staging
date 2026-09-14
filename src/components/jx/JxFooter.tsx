'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useId, useState } from 'react'
import { useJxStore } from './JxStore'

const COLUMNS = [
  {
    label: 'Product',
    links: [
      { label: 'Shop all', href: '/store' },
      { label: 'Membership', href: '/#membership' },
      { label: 'Health quiz', href: '/register' },
    ],
  },
  {
    label: 'Company',
    links: [
      { label: 'For providers', href: '/organization' },
      { label: 'Contact', href: '/organization' },
      { label: 'Telehealth', href: '/telehealth' },
    ],
  },
  {
    label: 'Legal',
    links: [
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Terms', href: '/legal/terms' },
    ],
  },
] as const

export function JxFooter() {
  const { toast } = useJxStore()
  const [email, setEmail] = useState('')
  const emailId = useId()

  function subscribe(event: React.FormEvent) {
    event.preventDefault()
    // No newsletter backend exists yet; acknowledge without implying storage.
    toast(email ? `Thanks — we'll be in touch at ${email}` : 'Enter an email to subscribe')
    if (email) setEmail('')
  }

  return (
    <footer id="footer" className="jx-footer">
      <div className="jx-shell jx-footer-head">
        <div>
          <div className="jx-display" style={{ fontSize: 20 }}>
            Stay in the know
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'rgba(242,241,234,.72)' }}>
            Get exclusive offers, health tips, and new product updates.
          </p>
        </div>

        <form
          onSubmit={subscribe}
          style={{ display: 'flex', gap: 10, flex: 1, maxWidth: 440, minWidth: 260 }}
        >
          <label htmlFor={emailId} className="jx-sr">
            Email address
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
          />
          <button type="submit" className="jx-btn jx-btn-onDark" style={{ padding: '0 22px' }}>
            Subscribe
          </button>
        </form>

        <nav aria-label="Social" style={{ display: 'flex', gap: 18, fontSize: 13 }}>
          <a href="https://instagram.com" rel="noopener noreferrer nofollow" target="_blank">
            Instagram
          </a>
          <a href="https://tiktok.com" rel="noopener noreferrer nofollow" target="_blank">
            TikTok
          </a>
          <a href="https://x.com" rel="noopener noreferrer nofollow" target="_blank">
            X
          </a>
        </nav>
      </div>

      <div className="jx-shell jx-footer-cols">
        <div style={{ maxWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Image
              src="/juvenex-logo.jpg"
              alt=""
              width={32}
              height={32}
              style={{ borderRadius: 9, objectFit: 'cover', display: 'block' }}
            />
            <span className="jx-display" style={{ fontSize: 19, letterSpacing: '.14em' }}>
              JUVENEX
            </span>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.6, color: 'rgba(242,241,234,.72)' }}>
            The GLP-1 companion platform built around personalized profiles, community
            accountability, clinical support, and outcomes that last.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.label} aria-label={column.label}>
            <h2 className="jx-footer-label">{column.label}</h2>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 13.5,
              }}
            >
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div
        className="jx-shell"
        style={{ paddingBottom: 34, fontSize: 12, color: 'rgba(242,241,234,.62)', lineHeight: 1.6 }}
      >
        © {new Date().getFullYear()} Juvenex. All rights reserved. Compounded GLP-1 medications
        are prescription-only and require a consultation with a licensed provider. This site is
        not medical advice.
      </div>
    </footer>
  )
}
