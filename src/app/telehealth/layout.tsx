import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'VIP Telehealth | Juvenex',
  description:
    'Member VIP telehealth products, patient intake, and checkout — native Juvenex experience.',
}

export default function TelehealthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
