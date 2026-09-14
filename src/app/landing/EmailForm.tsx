'use client';

import { useState } from 'react';
import { withBasePath } from '@/lib/base-path';

export default function EmailForm() {
  const [email, setEmail] = useState('');

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      window.location.href = withBasePath(
        `/register?email=${encodeURIComponent(email)}`
      );
    }
  };

  return (
    <form onSubmit={handleSignup} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto mb-6">
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 px-5 py-4 rounded-xl bg-white/10 border border-[#E5EAE3] focus:border-emerald-500 focus:outline-none placeholder-white/40"
      />
      <button type="submit" className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-xl font-semibold hover:opacity-90 transition-opacity">
        Start Free
      </button>
    </form>
  );
}
