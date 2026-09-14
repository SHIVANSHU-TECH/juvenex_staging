import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Learn | Juvenex',
  description:
    'Learn about GLP-1 medications, dosing protocols, and wellness strategies.',
}

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
