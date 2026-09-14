import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Profile | Juvenex',
  description: 'Manage your Juvenex profile, settings, and health preferences.',
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
