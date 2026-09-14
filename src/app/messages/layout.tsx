import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Messages | Juvenex',
  description: 'View messages from your Juvenex care team.',
}

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
