import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In | Juvenex',
  description: 'Sign in to your Juvenex account to track your GLP-1 journey.',
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
