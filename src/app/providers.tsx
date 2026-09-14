'use client';

import { AuthProvider } from '@/lib/auth-context';
import { OrganizationProvider } from '@/lib/organization-context';
import { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import TenantGuard from '@/components/TenantGuard';
import BasePathFetchPatch from '@/components/BasePathFetchPatch';

const ChatWidget = dynamic(() => import('@/components/ChatWidget'), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideChat = ['/', '/landing', '/login', '/register', '/landing-new'].includes(pathname);

  return (
    <AuthProvider>
      <OrganizationProvider>
        <BasePathFetchPatch />
        <TenantGuard />
        {children}
        {!hideChat && <ChatWidget />}
      </OrganizationProvider>
    </AuthProvider>
  );
}
