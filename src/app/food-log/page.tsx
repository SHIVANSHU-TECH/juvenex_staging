'use client';

import { useState, useEffect, useCallback, useId, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useMembershipGate } from '@/lib/membership';
import BottomNav from '@/components/BottomNav';
import BrandLogo from '@/components/BrandLogo';

interface FoodLogEntry {
  id: string;
  food: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  logged_at: string;
  notes: string | null;
}

interface DailyTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// A calorie/macro suggestion returned by /api/nutrition/search (USDA FDC).
interface NutritionSuggestion {
  fdcId: number;
  name: string;
  brand: string | null;
  serving: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function mealEmoji(type: string): string {
  switch (type) {
    case 'breakfast': return '🌅';
    case 'lunch': return '☀️';
    case 'dinner': return '🌙';
    case 'snack': return '🍎';
    default: return '🍽️';
  }
}

const INPUT_CLASS = "w-full px-4 py-2 min-h-[44px] rounded-xl bg-[#FAF9F6] border border-[#E5EAE3] text-[#2D352C] focus:border-[var(--accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors";

export default function FoodLogPage() {
  useMembershipGate();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [newMeal, setNewMeal] = useState({
    food: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    meal_type: 'breakfast',
    notes: '',
  });

  // Stable IDs for label/input + error wiring
  const foodId = useId();
  const caloriesId = useId();
  const proteinId = useId();
  const carbsId = useId();
  const fatId = useId();
  const mealTypeId = useId();
  const notesId = useId();
  const formErrorId = useId();
  const foodErrorId = useId();
  const foodListboxId = useId();

  // --- Nutrition auto-populate (USDA FoodData Central via /api/nutrition/search) ---
  const [suggestions, setSuggestions] = useState<NutritionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // Skip the next debounced search after a programmatic food change (e.g. the
  // user picked a suggestion) so selecting an item doesn't re-open the list.
  const suppressSearchRef = useRef(false);
  const foodComboId = useId();

  const targetCalories = 1800;
  const remaining = targetCalories - dailyTotals.calories;

  const todayDate = getTodayDate();

  const fetchFoodLog = useCallback(async () => {
    setIsLoadingEntries(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/food-log?date=${todayDate}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFetchError(json.error ?? 'Failed to load food log');
        return;
      }
      setEntries(json.data.entries);
      setDailyTotals(json.data.dailyTotals);
    } catch {
      setFetchError('Network error. Please try again.');
    } finally {
      setIsLoadingEntries(false);
    }
  }, [todayDate]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      // Fetch-on-mount. fetchFoodLog flips a loading flag synchronously, which
      // this rule flags; the cascade is intentional and bounded to one load.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchFoodLog();
    }
  }, [isAuthenticated, fetchFoodLog]);

  // Debounced lookup: as the user types a food name, fetch USDA suggestions.
  // Degrades silently — if the nutrition API is not configured or errors, the
  // dropdown simply stays empty and manual entry continues to work.
  useEffect(() => {
    if (!showAddMeal) return;

    // A suggestion was just applied — consume the flag and skip this run.
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }

    const term = newMeal.food.trim();
    let cancelled = false;

    // All state updates happen inside the debounced callback (asynchronously),
    // never synchronously in the effect body, to avoid cascading renders.
    const handle = setTimeout(async () => {
      if (term.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`/api/nutrition/search?q=${encodeURIComponent(term)}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.ok && json.success && Array.isArray(json.data?.results)) {
          setSuggestions(json.data.results);
          setShowSuggestions(json.data.results.length > 0);
          setActiveSuggestion(-1);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [newMeal.food, showAddMeal]);

  // Apply a chosen suggestion: fill the food name + calorie/macro fields. The
  // user can still edit any value afterwards (manual override preserved).
  const applySuggestion = (s: NutritionSuggestion) => {
    suppressSearchRef.current = true;
    setNewMeal((prev) => ({
      ...prev,
      food: s.name,
      calories: s.calories != null ? String(s.calories) : prev.calories,
      protein: s.protein != null ? String(s.protein) : prev.protein,
      carbs: s.carbs != null ? String(s.carbs) : prev.carbs,
      fat: s.fat != null ? String(s.fat) : prev.fat,
    }));
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveSuggestion(-1);
  };

  const handleFoodKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[activeSuggestion]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const addMeal = async () => {
    if (!newMeal.food.trim()) {
      setFormError('Please enter what you ate.');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        food: newMeal.food.trim(),
        meal_type: newMeal.meal_type,
      };
      if (newMeal.calories) body.calories = parseInt(newMeal.calories, 10);
      if (newMeal.protein) body.protein = parseFloat(newMeal.protein);
      if (newMeal.carbs) body.carbs = parseFloat(newMeal.carbs);
      if (newMeal.fat) body.fat = parseFloat(newMeal.fat);
      if (newMeal.notes.trim()) body.notes = newMeal.notes.trim();

      const res = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFormError(json.error ?? 'Failed to add meal');
        return;
      }
      setNewMeal({ food: '', calories: '', protein: '', carbs: '', fat: '', meal_type: 'breakfast', notes: '' });
      setSuggestions([]);
      setShowSuggestions(false);
      setShowAddMeal(false);
      await fetchFoodLog();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMeal = async (entryId: string) => {
    setDeletingId(entryId);
    try {
      const res = await fetch(`/api/food-log?entryId=${entryId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFetchError(json.error ?? 'Failed to delete entry');
        return;
      }
      await fetchFoodLog();
    } catch {
      setFetchError('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const recipes = [
    { id: 1, name: 'High Protein Overnight Oats', calories: 380, protein: 25, prep: '5 min', image: '🥣' },
    { id: 2, name: 'Grilled Chicken Quinoa Bowl', calories: 450, protein: 35, prep: '20 min', image: '🍗' },
    { id: 3, name: 'Salmon with Roasted Veggies', calories: 420, protein: 30, prep: '25 min', image: '🐟' },
    { id: 4, name: 'Greek Yogurt Parfait', calories: 280, protein: 20, prep: '2 min', image: '🥛' },
    { id: 5, name: 'Turkey Lettuce Wraps', calories: 320, protein: 28, prep: '10 min', image: '🦃' },
    { id: 6, name: 'Avocado Toast with Eggs', calories: 350, protein: 15, prep: '8 min', image: '🥑' },
  ];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite" className="text-center">
          <div className="w-10 h-10 border-3 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin mx-auto mb-3" aria-hidden="true" />
          <p className="text-[var(--text-muted)] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const foodIsInvalid = Boolean(formError && !newMeal.food.trim());

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              aria-label="Juvenex home"
              className="flex items-center gap-3 min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              <BrandLogo size={40} />
              <div>
                <p className="text-lg font-bold text-[#2D352C]">Food Log</p>
                <p className="text-xs text-[var(--accent-strong)]">Track your meals</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setShowAddMeal(!showAddMeal)}
              aria-expanded={showAddMeal}
              aria-controls="add-meal-form"
              className="px-4 py-2 min-h-[44px] bg-[var(--accent-strong)] text-white rounded-xl text-sm font-bold shadow-lg hover:bg-[var(--accent-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              + Add
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="px-4 py-4 space-y-4">
        <h1 className="sr-only">Food Log</h1>

        {/* Daily Summary */}
        <section aria-labelledby="summary-heading" className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 id="summary-heading" className="font-bold text-[#2D352C]">Today&apos;s Summary</h2>
            <span className="text-xs text-[var(--text-muted)]">{formatDisplayDate(todayDate)}</span>
          </div>
          {isLoadingEntries ? (
            <div role="status" aria-live="polite" className="flex justify-center py-4">
              <span className="sr-only">Loading summary…</span>
              <div className="w-6 h-6 border-2 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-3 rounded-xl bg-[#FAF9F6]">
                  <p className="text-xl font-bold text-[var(--accent-strong)]">{dailyTotals.calories}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Calories</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-[#FAF9F6]">
                  <p className="text-xl font-bold text-[var(--accent-strong)]">{targetCalories}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Target</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-[#FAF9F6]">
                  <p className={`text-xl font-bold ${remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{remaining}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Left</p>
                </div>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={targetCalories}
                aria-valuenow={Math.min(dailyTotals.calories, targetCalories)}
                aria-label={`Daily calories: ${dailyTotals.calories} of ${targetCalories}`}
                className="w-full h-3 bg-[#EEF1ED] rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] rounded-full"
                  style={{ width: `${Math.min((dailyTotals.calories / targetCalories) * 100, 100)}%` }}
                />
              </div>
              {/* Macro breakdown */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center p-2 rounded-lg bg-[#FAF9F6]">
                  <p className="text-sm font-bold text-[var(--accent-strong)]">{dailyTotals.protein}g</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Protein</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-[#FAF9F6]">
                  <p className="text-sm font-bold text-[var(--accent-strong)]">{dailyTotals.carbs}g</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Carbs</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-[#FAF9F6]">
                  <p className="text-sm font-bold text-[var(--accent-strong)]">{dailyTotals.fat}g</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Fat</p>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Add Meal Form */}
        {showAddMeal && (
          <section
            id="add-meal-form"
            aria-labelledby="add-meal-heading"
            className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl"
          >
            <h2 id="add-meal-heading" className="font-bold text-[#2D352C] mb-3">Add New Meal</h2>
            {formError && (
              <div
                id={formErrorId}
                role="alert"
                className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start justify-between gap-2"
              >
                <span>{formError}</span>
                <button
                  type="button"
                  onClick={() => setFormError(null)}
                  aria-label="Dismiss error"
                  className="min-h-[44px] min-w-[44px] -m-2 p-2 inline-flex items-center justify-center rounded-md text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label htmlFor={foodId} className="block text-sm font-medium text-[#2D352C] mb-1">
                  What did you eat?
                </label>
                <div className="relative">
                  <input
                    id={foodId}
                    type="text"
                    required
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showSuggestions}
                    aria-controls={foodListboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      activeSuggestion >= 0 ? `${foodComboId}-opt-${activeSuggestion}` : undefined
                    }
                    aria-required="true"
                    aria-invalid={foodIsInvalid}
                    aria-describedby={foodIsInvalid ? foodErrorId : undefined}
                    placeholder="e.g., Grilled chicken salad"
                    value={newMeal.food}
                    onChange={(e) => setNewMeal({ ...newMeal, food: e.target.value })}
                    onKeyDown={handleFoodKeyDown}
                    className={INPUT_CLASS}
                  />
                  {isSearching && (
                    <div
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <ul
                      id={foodListboxId}
                      role="listbox"
                      aria-label="Food suggestions"
                      className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-xl bg-white border border-[#E5EAE3] shadow-2xl"
                    >
                      {suggestions.map((s, i) => (
                        <li
                          key={s.fdcId}
                          id={`${foodComboId}-opt-${i}`}
                          role="option"
                          aria-selected={i === activeSuggestion}
                          onMouseDown={(e) => {
                            // onMouseDown (not onClick) so selection fires before
                            // the input's blur can dismiss the list.
                            e.preventDefault();
                            applySuggestion(s);
                          }}
                          onMouseEnter={() => setActiveSuggestion(i)}
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            i === activeSuggestion ? 'bg-[#EEF1ED]' : 'hover:bg-[#FAF9F6]'
                          }`}
                        >
                          <p className="font-medium text-[#2D352C] truncate">
                            {s.name}
                            {s.brand ? <span className="text-[var(--text-muted)] font-normal"> · {s.brand}</span> : null}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            {s.calories != null ? `${s.calories} cal` : 'cal n/a'}
                            {s.protein != null ? ` • ${s.protein}g P` : ''}
                            {s.carbs != null ? ` • ${s.carbs}g C` : ''}
                            {s.fat != null ? ` • ${s.fat}g F` : ''}
                            <span className="italic"> ({s.serving})</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Start typing to auto-fill calories &amp; macros — you can still edit any value.
                </p>
                {foodIsInvalid && (
                  <p id={foodErrorId} role="alert" className="mt-1 text-sm text-red-700">
                    Please enter what you ate.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={caloriesId} className="block text-sm font-medium text-[#2D352C] mb-1">
                    Calories
                  </label>
                  <input
                    id={caloriesId}
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g., 450"
                    value={newMeal.calories}
                    onChange={(e) => setNewMeal({ ...newMeal, calories: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor={proteinId} className="block text-sm font-medium text-[#2D352C] mb-1">
                    Protein (g)
                  </label>
                  <input
                    id={proteinId}
                    type="number"
                    inputMode="decimal"
                    placeholder="e.g., 35"
                    value={newMeal.protein}
                    onChange={(e) => setNewMeal({ ...newMeal, protein: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={carbsId} className="block text-sm font-medium text-[#2D352C] mb-1">
                    Carbs (g)
                  </label>
                  <input
                    id={carbsId}
                    type="number"
                    inputMode="decimal"
                    placeholder="e.g., 40"
                    value={newMeal.carbs}
                    onChange={(e) => setNewMeal({ ...newMeal, carbs: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor={fatId} className="block text-sm font-medium text-[#2D352C] mb-1">
                    Fat (g)
                  </label>
                  <input
                    id={fatId}
                    type="number"
                    inputMode="decimal"
                    placeholder="e.g., 15"
                    value={newMeal.fat}
                    onChange={(e) => setNewMeal({ ...newMeal, fat: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <label htmlFor={mealTypeId} className="block text-sm font-medium text-[#2D352C] mb-1">
                  Meal type
                </label>
                <select
                  id={mealTypeId}
                  value={newMeal.meal_type}
                  onChange={(e) => setNewMeal({ ...newMeal, meal_type: e.target.value })}
                  className={INPUT_CLASS}
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="snack">Snack</option>
                  <option value="dinner">Dinner</option>
                </select>
              </div>
              <div>
                <label htmlFor={notesId} className="block text-sm font-medium text-[#2D352C] mb-1">
                  Notes (optional)
                </label>
                <input
                  id={notesId}
                  type="text"
                  placeholder="e.g., post-workout"
                  value={newMeal.notes}
                  onChange={(e) => setNewMeal({ ...newMeal, notes: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <button
                type="button"
                onClick={addMeal}
                disabled={isSubmitting || !newMeal.food.trim()}
                className="w-full py-2 min-h-[44px] bg-[var(--accent-strong)] text-white rounded-xl font-bold disabled:opacity-50 hover:bg-[var(--accent-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
              >
                {isSubmitting ? 'Adding...' : 'Add Meal'}
              </button>
            </div>
          </section>
        )}

        {/* Error Banner */}
        {fetchError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between gap-2"
          >
            <span>{fetchError}</span>
            <button
              type="button"
              onClick={() => setFetchError(null)}
              aria-label="Dismiss error"
              className="min-h-[44px] min-w-[44px] -m-2 p-2 inline-flex items-center justify-center rounded-md text-red-700 font-bold hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}

        {/* Meals List */}
        {isLoadingEntries ? (
          <div role="status" aria-live="polite" className="flex justify-center py-8">
            <span className="sr-only">Loading meals…</span>
            <div className="w-8 h-8 border-3 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5EAE3] p-8 shadow-xl text-center">
            <div className="text-4xl mb-3" aria-hidden="true">🍽️</div>
            <p className="font-medium text-[#2D352C] mb-1">No meals logged yet</p>
            <p className="text-sm text-[var(--text-muted)]">Tap &quot;+ Add&quot; to log your first meal today</p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Logged meals">
            {entries.map((entry) => (
              <li key={entry.id} className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-xl shrink-0" aria-hidden="true">
                      {mealEmoji(entry.meal_type)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[#2D352C] truncate">
                        <span className="sr-only">{entry.meal_type}: </span>
                        {entry.food}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatTime(entry.logged_at)} {entry.calories != null ? `• ${entry.calories} cal` : ''}
                        {entry.protein != null ? ` • ${entry.protein}g P` : ''}
                      </p>
                      {entry.notes && <p className="text-xs text-[var(--text-muted)] mt-0.5 italic">{entry.notes}</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteMeal(entry.id)}
                    disabled={deletingId === entry.id}
                    className="ml-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors disabled:opacity-50 shrink-0"
                    aria-label={`Delete ${entry.food}`}
                  >
                    {deletingId === entry.id ? (
                      <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    ) : (
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Recipes Section */}
        <section aria-labelledby="recipes-heading" className="bg-white rounded-2xl border border-[#E5EAE3] shadow-xl overflow-hidden">
          <div className="p-4 border-b border-[#E5EAE3] bg-gradient-to-r from-[var(--accent-strong)]/10 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">🍽️</span>
                <h2 id="recipes-heading" className="font-bold text-[#2D352C]">Recipes</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowRecipes(!showRecipes)}
                aria-expanded={showRecipes}
                aria-controls="recipes-list"
                className="text-[var(--accent-strong)] text-sm font-bold min-h-[44px] px-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              >
                {showRecipes ? 'Hide' : 'Browse'}
              </button>
            </div>
          </div>
          {showRecipes && (
            <ul id="recipes-list" className="p-4 space-y-3">
              {recipes.map((recipe) => (
                <li key={recipe.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#FAF9F6] hover:bg-[#EEF1ED]">
                  <div className="w-12 h-12 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-2xl" aria-hidden="true">{recipe.image}</div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-[#2D352C]">{recipe.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{recipe.calories} cal • {recipe.protein}g protein • {recipe.prep}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Add ${recipe.name} to log`}
                    className="px-3 py-1 min-h-[44px] bg-[var(--accent-strong)] text-white rounded-lg text-xs font-bold hover:bg-[var(--accent-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
                  >
                    Add
                  </button>
                </li>
              ))}
              <Link
                href="/meals"
                className="block text-center py-2 min-h-[44px] text-[var(--accent-strong)] font-bold text-sm rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              >
                View All Recipes →
              </Link>
            </ul>
          )}
        </section>

        {/* Quick Add Buttons */}
        <nav aria-label="Quick add meal" className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => { setNewMeal({ ...newMeal, meal_type: 'breakfast' }); setShowAddMeal(true); }}
            className="bg-white rounded-xl p-3 min-h-[44px] text-center border border-[#E5EAE3] shadow-lg hover:border-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          >
            <div className="text-xl mb-1" aria-hidden="true">🌅</div>
            <p className="text-[10px] text-[#6B7567]">Breakfast</p>
          </button>
          <button
            type="button"
            onClick={() => { setNewMeal({ ...newMeal, meal_type: 'lunch' }); setShowAddMeal(true); }}
            className="bg-white rounded-xl p-3 min-h-[44px] text-center border border-[#E5EAE3] shadow-lg hover:border-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          >
            <div className="text-xl mb-1" aria-hidden="true">☀️</div>
            <p className="text-[10px] text-[#6B7567]">Lunch</p>
          </button>
          <button
            type="button"
            onClick={() => { setNewMeal({ ...newMeal, meal_type: 'snack' }); setShowAddMeal(true); }}
            className="bg-white rounded-xl p-3 min-h-[44px] text-center border border-[#E5EAE3] shadow-lg hover:border-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          >
            <div className="text-xl mb-1" aria-hidden="true">🍎</div>
            <p className="text-[10px] text-[#6B7567]">Snack</p>
          </button>
          <button
            type="button"
            onClick={() => { setNewMeal({ ...newMeal, meal_type: 'dinner' }); setShowAddMeal(true); }}
            className="bg-white rounded-xl p-3 min-h-[44px] text-center border border-[#E5EAE3] shadow-lg hover:border-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
          >
            <div className="text-xl mb-1" aria-hidden="true">🌙</div>
            <p className="text-[10px] text-[#6B7567]">Dinner</p>
          </button>
        </nav>
      </main>

      <BottomNav />
    </div>
  );
}
