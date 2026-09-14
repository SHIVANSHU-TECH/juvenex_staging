import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account | Juvenex',
  description:
    'Create your Juvenex account and start your GLP-1 wellness journey.',
}

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
