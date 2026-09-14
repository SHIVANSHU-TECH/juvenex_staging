'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import FeaturedBlogs from '@/components/FeaturedBlogs';
import BrandLogo, { BrandTitle } from '@/components/BrandLogo';
import { useAuth } from '@/lib/auth-context';

interface DashboardStat {
  key: string;
  value: string;
  label: string;
}

interface GoalData {
  startingWeight: number | null;
  currentWeight: number | null;
  targetWeight: number | null;
  goalPercent: number | null;
}

interface SummaryResponse {
  success: boolean;
  data?: { stats: DashboardStat[]; goal?: GoalData };
}

const EMPTY_STATS: DashboardStat[] = [
  { key: 'streak', value: '--', label: 'Day Streak' },
  { key: 'weight', value: '--', label: 'lbs Lost' },
  { key: 'calories', value: '--', label: "Today's Cal" },
  { key: 'a1c', value: '--', label: 'A1C Est.' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStat[]>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [goal, setGoal] = useState<GoalData | null>(null);

  // Goal (target weight) editor
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [goalError, setGoalError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch('/api/patient/summary', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = (await res.json()) as SummaryResponse;
      if (json.success && json.data?.stats) {
        setStats(json.data.stats);
        setGoal(json.data.goal ?? null);
      }
    } catch {
      // Keep the dashboard usable; empty states are better than mock data.
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // The dashboard is the app's authed home — an anonymous visitor otherwise
  // sees an empty "--" shell (found in the Jul 10 store-readiness crawl).
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    loadSummary();
  }, [authLoading, isAuthenticated, loadSummary]);

  const handleSaveGoal = async () => {
    const target = Number(targetInput);
    if (!Number.isFinite(target) || target <= 0 || target >= 2000) {
      setGoalError('Enter a valid goal weight in pounds.');
      return;
    }
    setGoalSaving(true);
    setGoalError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch('/api/patient/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ target_weight: target }),
      });
      if (!res.ok) {
        setGoalError('Could not save goal. Please try again.');
        return;
      }
      setGoalEditing(false);
      // Re-pull the summary so the goal % recomputes from the saved target.
      await loadSummary();
    } catch {
      setGoalError('Could not save goal. Please try again.');
    } finally {
      setGoalSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3">
              <BrandLogo size={40} priority />
              <BrandTitle />
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="px-4 py-4 space-y-4">
        <Link href="/telehealth" className="block rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] p-4 shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-white shadow-md">
                <Image
                  src="/doctor-chat-icon.png"
                  alt="Provider"
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-bold text-lg text-white">Speak to a Provider</p>
                <p className="text-sm text-white/80">Get your GLP-1 prescription</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-4 gap-2">
          {stats.map((stat) => (
            <div key={stat.key} className="bg-white rounded-2xl p-3 text-center border border-[#E5EAE3] shadow-xl">
              <p className="text-lg font-bold text-[var(--accent)] tabular-nums">
                {statsLoading ? <span className="inline-block h-5 w-8 rounded bg-[#F5F8F3] animate-pulse" /> : stat.value}
              </p>
              <p className="text-[10px] text-[#8B9B83]">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Goal progress + target editor */}
        {!statsLoading && (
          <div className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#2D352C]">Goal Progress</h2>
                <p className="text-xs text-[#6B7567]">
                  {goal?.targetWeight
                    ? `${goal.currentWeight ?? '--'} lbs now · goal ${goal.targetWeight} lbs`
                    : 'Set a goal weight to track your progress'}
                </p>
              </div>
              {!goalEditing && (
                <button
                  type="button"
                  onClick={() => { setTargetInput(goal?.targetWeight ? String(goal.targetWeight) : ''); setGoalError(null); setGoalEditing(true); }}
                  className="min-h-9 shrink-0 rounded-full bg-[#EEF1ED] px-3 text-xs font-bold text-[#53634D] hover:bg-[#E5EAE3]"
                >
                  {goal?.targetWeight ? 'Edit target' : 'Set target'}
                </button>
              )}
            </div>

            {goal?.targetWeight != null && goal.goalPercent != null && !goalEditing && (
              <>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#EEF1ED]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent-secondary)] to-[var(--accent)]"
                    style={{ width: `${goal.goalPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs font-bold text-[var(--accent)]">{goal.goalPercent}% there</p>
              </>
            )}

            {goalEditing && (
              <div className="mt-3 space-y-2">
                {goalError && <p className="text-xs text-red-600">{goalError}</p>}
                <label htmlFor="dash-goal-target" className="block text-xs font-semibold text-[#6B7567]">
                  Goal weight (lbs)
                </label>
                <div className="flex gap-2">
                  <input
                    id="dash-goal-target"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.1"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    placeholder="e.g. 170"
                    className="flex-1 rounded-xl border border-[#E5EAE3] px-3 py-2 text-sm text-[#2D352C] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveGoal}
                    disabled={goalSaving || !targetInput.trim()}
                    className="min-h-[42px] rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {goalSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGoalEditing(false)}
                    className="min-h-[42px] rounded-xl border border-[#E5EAE3] px-3 text-sm font-bold text-[#6B7567] hover:bg-[#FAF9F6]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { href: '/food-log', icon: '&#x1F37D;&#xFE0F;', title: 'Food Log', desc: 'Track meals & calories' },
            { href: '/meals', icon: '&#x1F957;', title: 'Meal Generator', desc: 'Personalized recipes' },
            { href: '/learn', icon: '&#x1F4DA;', title: 'Learn', desc: 'Peptides & wellness' },
            { href: '/store', icon: '&#x1F6D2;', title: 'Shop', desc: 'Supplements & gear' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="group bg-gradient-to-br from-[#F5F8F3] to-[#EEF1ED] rounded-2xl p-4 border border-[#D8DFD5] shadow-xl hover:shadow-2xl hover:border-[var(--accent)] transition-all">
              <div className="w-12 h-12 rounded-xl bg-[#E2E8DF] flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform" dangerouslySetInnerHTML={{ __html: item.icon }} />
              <h3 className="font-bold text-base text-[#2D352C]">{item.title}</h3>
              <p className="text-xs text-[#6B7567]">{item.desc}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/profile', icon: '&#x1F464;', label: 'Profile' },
            { href: '/telehealth', icon: '&#x1F4F9;', label: 'Consult' },
            { href: '/intake', icon: '&#x1F4DD;', label: 'Intake' },
            { href: '/store/account/orders', icon: '&#x1F4E6;', label: 'Orders' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="bg-white rounded-xl p-3 text-center border border-[#E5EAE3] shadow-lg hover:border-[var(--accent)] hover:shadow-xl transition-all">
              <div className="text-xl mb-1" dangerouslySetInnerHTML={{ __html: item.icon }} />
              <p className="text-xs text-[#6B7567]">{item.label}</p>
            </Link>
          ))}
        </div>

        <FeaturedBlogs />
      </main>

      <BottomNav />
    </div>
  );
}
