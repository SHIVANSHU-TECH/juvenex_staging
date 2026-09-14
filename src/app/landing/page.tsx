import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

export const metadata: Metadata = {
  title: 'Juvenex - GLP-1 care, all in one place',
  description: 'Track weight, meals, GLP-1 protocols, and community progress with Juvenex.',
  alternates: {
    canonical: 'https://juvenex.space',
  },
};

export default function LandingRoute() {
  return <LandingPage />;
}
