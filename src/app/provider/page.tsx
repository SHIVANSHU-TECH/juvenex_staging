'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useMembershipGate } from '@/lib/membership';

export default function ProviderPortal() {
  const { user, isLoading, isAuthenticated } = useAuth();
  useMembershipGate();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="animate-pulse text-[#2D352C]/60">Loading...</div>
      </div>
    );
  }

  const workflowCards = [
    {
      title: 'Consult Queue',
      icon: '📅',
      body: 'Review booked consults from telehealth and keep prescription decisions tied to each patient.',
      href: '/telehealth',
      action: 'Open telehealth',
    },
    {
      title: 'Patient Context',
      icon: '👥',
      body: 'Use profile, food log, weight, and progress updates to understand the patient before issuing guidance.',
      href: '/profile',
      action: 'View profile',
    },
    {
      title: 'Prescription Access',
      icon: '💊',
      body: 'Issued prescriptions unlock matching prescription-only products in the shop after webhook sync.',
      href: '/store',
      action: 'View shop',
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FAF9F6]/80 backdrop-blur-xl border-b border-[#E5EAE3]">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl">
                🏥
              </div>
              <div>
                <h1 className="text-lg font-bold">Provider Portal</h1>
                <p className="text-xs text-[#2D352C]/50">Clinical workflow</p>
              </div>
            </div>
            <Link href="/" className="text-sm text-[#2D352C]/60 hover:text-[#2D352C]">
              Back to App
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* User Info */}
        <div className="rounded-3xl bg-white border border-[#E5EAE3] p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl font-bold text-white">
              {user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-semibold text-lg">{user?.name || 'Provider'}</p>
              <p className="text-sm text-[#2D352C]/60 capitalize">{user?.role?.replace('_', ' ') || 'User'}</p>
            </div>
          </div>
        </div>

        {/* Workflow Banner */}
        <div className="rounded-3xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 p-6 mb-6">
          <h2 className="text-2xl font-bold mb-2">Provider Workflow</h2>
          <p className="text-[#2D352C]/60 max-w-2xl">
            Juvenex keeps the app experience separate from clinical prescribing. Providers run consults through telehealth, and prescription events sync back to unlock eligible products for the patient.
          </p>
        </div>

        {/* Workflow Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {workflowCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-2xl bg-white border border-[#E5EAE3] p-6 text-center hover:border-blue-300 hover:shadow-lg transition-all"
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <h3 className="font-semibold mb-2">{card.title}</h3>
              <p className="text-sm text-[#2D352C]/50 mb-4">{card.body}</p>
              <span className="inline-flex items-center text-sm font-semibold text-blue-700">
                {card.action} →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
