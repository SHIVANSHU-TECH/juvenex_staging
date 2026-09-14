import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Food Log | Juvenex',
  description:
    'Track your daily meals and nutrition to optimize your GLP-1 journey.',
}

export default function FoodLogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
