// Per-tenant product overrides admin page.
//
// Lives at /admin/organizations/[id]/products. The shell here exists so the
// route segment can pre-validate the org id format and pass a typed string
// down to the client table. The actual data fetching (catalog + overrides)
// happens in the client because the rest of the admin UI ships its
// Supabase JWT in localStorage and adds it as a Bearer header — server-side
// fetches here cannot reach those auth-gated APIs without that token.
//
// This is consistent with how /admin (legacy) renders today: a thin shell
// over a 'use client' tab tree. See src/app/admin/page.tsx.

import { notFound } from 'next/navigation';
import ProductOverridesTable from './ProductOverridesTable';

interface PageProps {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrgProductsPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-[#FAF9F6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProductOverridesTable orgId={id} />
      </div>
    </main>
  );
}
