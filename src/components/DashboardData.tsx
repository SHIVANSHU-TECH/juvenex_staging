'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface PatientProfile {
  current_weight?: number;
  height?: number;
  target_weight?: number;
}

interface DashboardDataState {
  dailyCalories: number;
  dailyTotals: DailyTotals | null;
  mealsToday: number;
  weight: number | null;
  goalWeight: number | null;
  isLoading: boolean;
  error: string | null;
}

function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

export function useDashboardData(): DashboardDataState {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<DashboardDataState>({
    dailyCalories: 0,
    dailyTotals: null,
    mealsToday: 0,
    weight: null,
    goalWeight: null,
    isLoading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const todayDate = getTodayDate();

    try {
      const [foodRes, profileRes] = await Promise.allSettled([
        fetch(`/api/food-log?date=${todayDate}`),
        fetch('/api/patient/profile'),
      ]);

      let dailyCalories = 0;
      let dailyTotals: DailyTotals | null = null;
      let mealsToday = 0;

      if (foodRes.status === 'fulfilled' && foodRes.value.ok) {
        const foodJson = await foodRes.value.json();
        if (foodJson.success && foodJson.data?.dailyTotals) {
          dailyTotals = foodJson.data.dailyTotals;
          dailyCalories = foodJson.data.dailyTotals.calories;
        }
        if (foodJson.success && Array.isArray(foodJson.data?.entries)) {
          mealsToday = foodJson.data.entries.length;
        }
      }

      let weight: number | null = null;
      let goalWeight: number | null = null;

      if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
        const profileJson = await profileRes.value.json();
        const patient: PatientProfile | undefined = profileJson.data?.patient_profile;
        if (patient) {
          weight = patient.current_weight ?? null;
          goalWeight = patient.target_weight ?? null;
        }
      }

      setState({
        dailyCalories,
        dailyTotals,
        mealsToday,
        weight,
        goalWeight,
        isLoading: false,
        error: null,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load dashboard data',
      }));
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData();
    } else {
      const id = setTimeout(() => setState((prev) => ({ ...prev, isLoading: false })), 0);
      return () => clearTimeout(id);
    }
  }, [isAuthenticated, fetchData]);

  return state;
}

interface DashboardStatsProps {
  className?: string;
}

export function DashboardStats({ className }: DashboardStatsProps) {
  const { dailyCalories, mealsToday, weight, isLoading } = useDashboardData();

  if (isLoading) {
    return (
      <div className={className}>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-3 text-center border border-[#E5EAE3] shadow-xl animate-pulse">
              <div className="h-5 w-8 bg-[#EEF1ED] rounded mx-auto mb-1" />
              <div className="h-3 w-12 bg-[#EEF1ED] rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white rounded-2xl p-3 text-center border border-[#E5EAE3] shadow-xl">
          <p className="text-lg font-bold text-[var(--accent)]">-</p>
          <p className="text-[10px] text-[#8B9B83]">Day Streak</p>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center border border-[#E5EAE3] shadow-xl">
          <p className="text-lg font-bold text-[var(--accent)]">{weight != null ? `${weight}` : '-'}</p>
          <p className="text-[10px] text-[#8B9B83]">{weight != null ? 'lbs' : 'Weight'}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center border border-[#E5EAE3] shadow-xl">
          <p className="text-lg font-bold text-[var(--accent)]">{dailyCalories > 0 ? dailyCalories.toLocaleString() : '-'}</p>
          <p className="text-[10px] text-[#8B9B83]">Today&apos;s Cal</p>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center border border-[#E5EAE3] shadow-xl">
          <p className="text-lg font-bold text-[var(--accent)]">{mealsToday > 0 ? mealsToday : '0'}</p>
          <p className="text-[10px] text-[#8B9B83]">Meals Today</p>
        </div>
      </div>
    </div>
  );
}
