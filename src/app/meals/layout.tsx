import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Meal Plans | Juvenex',
  description:
    'Get personalized meal plans tailored to your GLP-1 medication and health goals.',
}

export default function MealsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
