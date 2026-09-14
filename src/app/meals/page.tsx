'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useMembershipGate } from '@/lib/membership';
import BottomNav from '@/components/BottomNav';
import BrandLogo from '@/components/BrandLogo';

type Step = 'goals' | 'status' | 'diet' | 'medical' | 'generate' | 'results';

interface PatientData {
  primaryGoal: string;
  targetWeight: number;
  timeline: string;
  currentWeight: number;
  height: number;
  age: number;
  gender: string;
  activityLevel: string;
  dietType: string;
  allergies: string[];
  restrictions: string[];
  foodsToAvoid: string[];
  conditions: string[];
  hasGlp1Experience: boolean;
}

interface GeneratedMeal {
  name: string;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  ingredients: string[];
  prep_time: string;
  instructions: string;
}

interface NutritionSummary {
  daily_calories: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

interface MealPlanResult {
  id?: string;
  meals: GeneratedMeal[];
  nutrition_summary: NutritionSummary;
  recommendations: string[];
  calorie_target?: number;
  target_basis?: string;
  created_at?: string;
}

const ALLERGY_OPTIONS = ['Dairy', 'Gluten', 'Nuts', 'Shellfish', 'Eggs', 'Soy'];
const RESTRICTION_OPTIONS = ['Vegetarian', 'Vegan', 'Pescatarian', 'Keto', 'Paleo'];
const CONDITION_OPTIONS = ['Diabetes', 'High Blood Pressure', 'Heart Disease', 'Thyroid', 'Kidney Disease'];

const MEAL_TYPE_EMOJI: Record<string, string> = {
  breakfast: '\u{1F373}',
  lunch: '\u{1F957}',
  dinner: '\u{1F356}',
  snack: '\u{1F34E}',
};

function mapGoalToApi(goal: string): string {
  const mapping: Record<string, string> = {
    'Weight Loss': 'weight_loss',
    'Maintain Weight': 'maintain',
    'Build Muscle': 'muscle_gain',
    'Diabetes Management': 'blood_sugar',
  };
  return mapping[goal] ?? 'weight_loss';
}

function mapDietToApi(diet: string): string {
  const mapping: Record<string, string> = {
    'balanced': 'balanced',
    'low-carb': 'low_carb',
    'keto': 'keto',
    'paleo': 'paleo',
    'mediterranean': 'mediterranean',
    'high-protein': 'balanced',
  };
  return mapping[diet] ?? 'balanced';
}

export default function AIMealsPage() {
  useMembershipGate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>('goals');
  const [data, setData] = useState<PatientData>({
    primaryGoal: '',
    targetWeight: 0,
    timeline: '',
    currentWeight: 0,
    height: 0,
    age: 0,
    gender: '',
    activityLevel: 'moderate',
    dietType: 'balanced',
    allergies: [],
    restrictions: [],
    foodsToAvoid: [],
    conditions: [],
    hasGlp1Experience: false,
  });
  const [mealPlanResult, setMealPlanResult] = useState<MealPlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savedPlans, setSavedPlans] = useState<MealPlanResult[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  // Load previously generated/saved meal plans. Each row stores `plan` and
  // `request_params` as JSON strings; we parse them back into MealPlanResult so
  // the user can re-open a saved plan. (Recommendations aren't persisted, so a
  // re-opened plan shows an empty list there — the meals + macros are intact.)
  const fetchSavedPlans = useCallback(async () => {
    setSavedLoading(true);
    try {
      const token = getToken();
      const res = await fetch('/api/meals/generate?limit=20', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) return;

      const parsed: MealPlanResult[] = [];
      for (const row of json.data as Array<{ id: string; plan: string; request_params: string | null; created_at: string }>) {
        try {
          const plan = JSON.parse(row.plan) as {
            meals?: GeneratedMeal[];
            nutrition_summary?: NutritionSummary;
          };
          const params = row.request_params
            ? (JSON.parse(row.request_params) as { calorie_target?: number })
            : {};
          if (!plan.meals || !plan.nutrition_summary) continue;
          parsed.push({
            id: row.id,
            meals: plan.meals,
            nutrition_summary: plan.nutrition_summary,
            recommendations: [],
            calorie_target: params.calorie_target ?? plan.nutrition_summary.daily_calories,
            created_at: row.created_at,
          });
        } catch {
          // Skip any row whose stored JSON can't be parsed.
        }
      }
      setSavedPlans(parsed);
    } catch {
      // Non-fatal — the wizard still works without the saved list.
    } finally {
      setSavedLoading(false);
    }
  }, []);

  // Fetch patient profile on mount to pre-fill form
  useEffect(() => {
    if (!isAuthenticated || profileLoaded) return;

    const fetchProfile = async () => {
      try {
        const token = getToken();
        const res = await fetch('/api/patient/profile', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success || !json.data?.patient_profile) return;

        const pp = json.data.patient_profile;
        setData(prev => ({
          ...prev,
          currentWeight: pp.current_weight ?? prev.currentWeight,
          targetWeight: pp.target_weight ?? prev.targetWeight,
          height: pp.height ?? prev.height,
          age: pp.age ?? prev.age,
          gender: pp.gender ? pp.gender.charAt(0).toUpperCase() + pp.gender.slice(1) : prev.gender,
          activityLevel: pp.activity_level ?? prev.activityLevel,
          dietType: pp.diet_type ?? prev.dietType,
          primaryGoal: pp.primary_goal
            ? { weight_loss: 'Weight Loss', maintain: 'Maintain Weight', muscle_gain: 'Build Muscle', blood_sugar: 'Diabetes Management', glp1_optimize: 'Weight Loss' }[pp.primary_goal as string] ?? prev.primaryGoal
            : prev.primaryGoal,
          allergies: pp.allergies ?? prev.allergies,
          restrictions: pp.restrictions ?? prev.restrictions,
          foodsToAvoid: pp.foods_to_avoid ?? prev.foodsToAvoid,
          conditions: pp.conditions ?? prev.conditions,
          hasGlp1Experience: pp.has_glp1_experience ?? prev.hasGlp1Experience,
        }));
      } catch {
        // Silently fail - user can fill the form manually
      } finally {
        setProfileLoaded(true);
      }
    };

    fetchProfile();
  }, [isAuthenticated, profileLoaded]);

  // Load saved meal plans once the user is authenticated.
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchSavedPlans();
  }, [isAuthenticated, fetchSavedPlans]);

  const updateData = (field: keyof PatientData, value: unknown) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (field: 'allergies' | 'restrictions' | 'conditions', item: string) => {
    const current = data[field];
    if (current.includes(item)) {
      updateData(field, current.filter(i => i !== item));
    } else {
      updateData(field, [...current, item]);
    }
  };

  const nextStep = () => {
    const steps: Step[] = ['goals', 'status', 'diet', 'medical', 'generate', 'results'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: Step[] = ['goals', 'status', 'diet', 'medical', 'generate', 'results'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const generateMeals = async () => {
    setLoading(true);
    setError(null);
    setStep('generate');

    try {
      const preferences = {
        goal: mapGoalToApi(data.primaryGoal),
        dietary_restrictions: [
          ...data.restrictions.map(r => r.toLowerCase()),
          ...(data.dietType !== 'balanced' ? [mapDietToApi(data.dietType)] : []),
        ],
        allergies: data.allergies.map(a => a.toLowerCase()),
        meal_count: 3,
        include_snacks: true,
        // Body stats the user entered/confirmed in the wizard drive the calorie
        // target. The server falls back to the saved profile for any omitted
        // field, so edits here take effect even before onboarding is complete.
        ...(data.currentWeight > 0 ? { current_weight: data.currentWeight } : {}),
        ...(data.height > 0 ? { height: data.height } : {}),
        ...(data.age > 0 ? { age: data.age } : {}),
        ...(data.gender ? { gender: data.gender.toLowerCase() } : {}),
        ...(data.activityLevel ? { activity_level: data.activityLevel } : {}),
      };

      const token = getToken();
      const res = await fetch('/api/meals/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(preferences),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to generate meal plan');
      }

      setMealPlanResult(json.data);
      setStep('results');
      // Refresh the saved-plans list so the new plan shows up immediately.
      fetchSavedPlans();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setStep('medical');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { id: 'goals', label: 'Goals', number: 1 },
    { id: 'status', label: 'Status', number: 2 },
    { id: 'diet', label: 'Diet', number: 3 },
    { id: 'medical', label: 'Medical', number: 4 },
    { id: 'results', label: 'Results', number: 5 },
  ];
  const currentStepNum = steps.findIndex(s => s.id === step) + 1;

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6B7567]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-[#E5EAE3] p-8 shadow-xl text-center max-w-sm w-full">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-[#2D352C] mb-2">Sign In Required</h2>
          <p className="text-[#6B7567] text-sm mb-6">Please log in to access personalized meal planning.</p>
          <Link href="/login" className="inline-block w-full py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-lg shadow-lg text-center">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2D352C] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] shadow-xl">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3">
              <BrandLogo size={40} />
              <div>
                <h1 className="text-lg font-bold text-[#2D352C]">Meals</h1>
                <p className="text-xs text-[var(--accent)]">Personalized Recipes</p>
              </div>
            </Link>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      {step !== 'generate' && (
        <div className="px-4 py-3 bg-white border-b border-[#E5EAE3]">
          <div className="flex items-center justify-between text-xs text-[#8B9B83] mb-1">
            <span>Step {currentStepNum} of {steps.length}</span>
            <span>{Math.round((currentStepNum / steps.length) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-[#E5EAE3] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${(currentStepNum / steps.length) * 100}%` }} />
          </div>
          <div className="flex justify-center gap-1 mt-2">
            {steps.map((s) => (
              <div key={s.id} className={`w-2 h-2 rounded-full ${step === s.id ? 'bg-[var(--accent)]' : currentStepNum > s.number ? 'bg-[var(--accent)]' : 'bg-[#E5EAE3]'}`} />
            ))}
          </div>
        </div>
      )}

      <main className="px-4 py-4">
        {/* Error Banner */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-red-500 text-lg">&#x26A0;&#xFE0F;</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-600 underline mt-1">Dismiss</button>
            </div>
          </div>
        )}

        {/* Step 1: Goals */}
        {step === 'goals' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#2D352C]">Your Goals</h2>

            <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Primary Goal</label>
              <div className="space-y-2">
                {['Weight Loss', 'Maintain Weight', 'Build Muscle', 'Diabetes Management'].map((goal) => (
                  <button key={goal} onClick={() => updateData('primaryGoal', goal)} className={`w-full p-3 rounded-xl text-left font-medium ${data.primaryGoal === goal ? 'bg-[var(--accent)] text-white' : 'bg-[#FAF9F6] border border-[#E5EAE3]'}`}>
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-[#E5EAE3] p-3 shadow-lg">
                <label className="block text-xs font-medium text-[#6B7567] mb-1">Current Weight (lbs)</label>
                <input type="number" value={data.currentWeight || ''} onChange={(e) => updateData('currentWeight', parseInt(e.target.value))} className="w-full text-lg font-bold text-[#2D352C] bg-transparent border-none focus:outline-none" placeholder="185" />
              </div>
              <div className="bg-white rounded-xl border border-[#E5EAE3] p-3 shadow-lg">
                <label className="block text-xs font-medium text-[#6B7567] mb-1">Goal Weight (lbs)</label>
                <input type="number" value={data.targetWeight || ''} onChange={(e) => updateData('targetWeight', parseInt(e.target.value))} className="w-full text-lg font-bold text-[#2D352C] bg-transparent border-none focus:outline-none" placeholder="160" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-3 shadow-lg">
              <label className="block text-xs font-medium text-[#6B7567] mb-1">Timeline</label>
              <select value={data.timeline} onChange={(e) => updateData('timeline', e.target.value)} className="w-full text-lg font-bold text-[#2D352C] bg-transparent border-none focus:outline-none">
                <option value="">Select timeline...</option>
                <option value="1month">1 month</option>
                <option value="3months">3 months</option>
                <option value="6months">6 months</option>
                <option value="1year">1 year</option>
              </select>
            </div>

            <button onClick={nextStep} disabled={!data.primaryGoal} className="w-full py-4 rounded-xl bg-[var(--accent)] text-white font-bold text-lg shadow-lg disabled:opacity-50">Next &rarr;</button>

            {/* Saved Plans */}
            <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
              <h3 className="font-bold text-[#2D352C] mb-1">Your Saved Plans</h3>
              <p className="text-xs text-[#8B9B83] mb-3">Re-open a meal plan you generated before.</p>
              {savedLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-xl bg-[#F5F8F3] animate-pulse" />
                  ))}
                </div>
              ) : savedPlans.length === 0 ? (
                <p className="text-sm text-[#6B7567]">No saved plans yet. Generate one to see it here.</p>
              ) : (
                <ul className="space-y-2">
                  {savedPlans.map((plan) => (
                    <li key={plan.id ?? plan.created_at}>
                      <button
                        type="button"
                        onClick={() => { setMealPlanResult(plan); setStep('results'); setError(null); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#FAF9F6] hover:bg-[#EEF1ED] text-left border border-[#E5EAE3]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-xl">&#x1F37D;&#xFE0F;</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-[#2D352C] truncate">
                            {plan.meals.length} meal{plan.meals.length === 1 ? '' : 's'} · {plan.nutrition_summary.total_calories} cal
                          </p>
                          <p className="text-xs text-[#8B9B83]">
                            {plan.created_at ? new Date(plan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Saved plan'}
                          </p>
                        </div>
                        <span className="text-[#8B9B83]">&rarr;</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Status */}
        {step === 'status' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#2D352C]">Your Status</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-[#E5EAE3] p-3 shadow-lg">
                <label className="block text-xs font-medium text-[#6B7567] mb-1">Height (inches)</label>
                <input type="number" value={data.height || ''} onChange={(e) => updateData('height', parseInt(e.target.value))} className="w-full text-lg font-bold text-[#2D352C] bg-transparent border-none focus:outline-none" placeholder="70" />
              </div>
              <div className="bg-white rounded-xl border border-[#E5EAE3] p-3 shadow-lg">
                <label className="block text-xs font-medium text-[#6B7567] mb-1">Age</label>
                <input type="number" value={data.age || ''} onChange={(e) => updateData('age', parseInt(e.target.value))} className="w-full text-lg font-bold text-[#2D352C] bg-transparent border-none focus:outline-none" placeholder="35" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Gender</label>
              <div className="flex gap-2">
                {['Male', 'Female', 'Other'].map((gender) => (
                  <button key={gender} onClick={() => updateData('gender', gender)} className={`flex-1 py-2 rounded-lg font-medium ${data.gender === gender ? 'bg-[var(--accent)] text-white' : 'bg-[#FAF9F6] border border-[#E5EAE3]'}`}>{gender}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Activity Level</label>
              <div className="space-y-2">
                {['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active'].map((level) => (
                  <button key={level} onClick={() => updateData('activityLevel', level.toLowerCase())} className={`w-full p-2 rounded-lg text-left text-sm ${data.activityLevel === level.toLowerCase() ? 'bg-[var(--accent)] text-white' : 'bg-[#FAF9F6] border border-[#E5EAE3]'}`}>{level}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={prevStep} className="flex-1 py-4 rounded-xl border-2 border-[#E5EAE3] font-bold text-[#6B7567]">&larr; Back</button>
              <button onClick={nextStep} className="flex-1 py-4 rounded-xl bg-[var(--accent)] text-white font-bold text-lg shadow-lg">Next &rarr;</button>
            </div>
          </div>
        )}

        {/* Step 3: Diet */}
        {step === 'diet' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#2D352C]">Diet Preferences</h2>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Diet Type</label>
              <div className="grid grid-cols-2 gap-2">
                {['Balanced', 'Low-carb', 'Keto', 'Paleo', 'Mediterranean', 'High Protein'].map((diet) => (
                  <button key={diet} onClick={() => updateData('dietType', diet.toLowerCase().replace(' ', '-'))} className={`py-2 rounded-lg text-sm font-medium ${data.dietType === diet.toLowerCase().replace(' ', '-') ? 'bg-[var(--accent)] text-white' : 'bg-[#FAF9F6] border border-[#E5EAE3]'}`}>{diet}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Allergies</label>
              <div className="flex flex-wrap gap-2">
                {ALLERGY_OPTIONS.map((allergy) => (
                  <button key={allergy} onClick={() => toggleArrayItem('allergies', allergy)} className={`px-3 py-1 rounded-full text-sm font-medium ${data.allergies.includes(allergy) ? 'bg-red-500 text-white' : 'bg-[#FAF9F6] border border-[#E5EAE3]'}`}>{allergy}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Restrictions</label>
              <div className="flex flex-wrap gap-2">
                {RESTRICTION_OPTIONS.map((restriction) => (
                  <button key={restriction} onClick={() => toggleArrayItem('restrictions', restriction)} className={`px-3 py-1 rounded-full text-sm font-medium ${data.restrictions.includes(restriction) ? 'bg-[var(--accent)] text-white' : 'bg-[#FAF9F6] border border-[#E5EAE3]'}`}>{restriction}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Foods to Avoid (comma separated)</label>
              <textarea value={data.foodsToAvoid.join(', ')} onChange={(e) => updateData('foodsToAvoid', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="w-full p-3 rounded-xl bg-[#FAF9F6] border border-[#E5EAE3]" placeholder="e.g., pork, alcohol, caffeine" rows={2} />
            </div>

            <div className="flex gap-3">
              <button onClick={prevStep} className="flex-1 py-4 rounded-xl border-2 border-[#E5EAE3] font-bold text-[#6B7567]">&larr; Back</button>
              <button onClick={nextStep} className="flex-1 py-4 rounded-xl bg-[var(--accent)] text-white font-bold text-lg shadow-lg">Next &rarr;</button>
            </div>
          </div>
        )}

        {/* Step 4: Medical */}
        {step === 'medical' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#2D352C]">Medical Info</h2>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="block text-sm font-medium text-[#2D352C] mb-2">Health Conditions</label>
              <div className="flex flex-wrap gap-2">
                {CONDITION_OPTIONS.map((condition) => (
                  <button key={condition} onClick={() => toggleArrayItem('conditions', condition)} className={`px-3 py-1 rounded-full text-sm font-medium ${data.conditions.includes(condition) ? 'bg-amber-500 text-white' : 'bg-[#FAF9F6] border border-[#E5EAE3]'}`}>{condition}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#E5EAE3] p-4 shadow-lg">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={data.hasGlp1Experience} onChange={(e) => updateData('hasGlp1Experience', e.target.checked)} className="w-5 h-5 rounded accent-[var(--accent)]" />
                <span className="text-sm font-medium text-[#2D352C]">I have used GLP-1 medications before</span>
              </label>
            </div>

            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <p className="text-xs text-amber-700">&#x26A0;&#xFE0F; Always consult a healthcare provider before starting any new diet or supplement regimen.</p>
            </div>

            <div className="flex gap-3">
              <button onClick={prevStep} className="flex-1 py-4 rounded-xl border-2 border-[#E5EAE3] font-bold text-[#6B7567]">&larr; Back</button>
              <button onClick={generateMeals} disabled={loading} className="flex-1 py-4 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white font-bold text-lg shadow-lg disabled:opacity-50">Generate Meals &rarr;</button>
            </div>
          </div>
        )}

        {/* Generate - Loading State */}
        {step === 'generate' && (
          <div className="text-center py-12">
            <div className="text-6xl mb-6">&#x1F37D;&#xFE0F;</div>
            <h2 className="text-2xl font-bold text-[#2D352C] mb-2">Generating Your Meal Plan</h2>
            <p className="text-[#6B7567] mb-2">Creating personalized recipes based on your goals...</p>
            <p className="text-xs text-[#8B9B83] mb-6">This may take up to 10 seconds</p>
            <div className="flex justify-center gap-1">
              <div className="w-3 h-3 bg-[var(--accent)] rounded-full animate-bounce"></div>
              <div className="w-3 h-3 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-3 h-3 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        )}

        {/* Results */}
        {step === 'results' && mealPlanResult && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Your Personalized Meal Plan</h2>
                  <p className="text-white/80 text-sm">Based on your goals: {data.primaryGoal}</p>
                </div>
                <div className="bg-white/20 rounded-lg px-3 py-1">
                  <span className="text-white text-xs font-medium">&#x2713; Saved</span>
                </div>
              </div>
            </div>

            {/* Nutrition Summary */}
            <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
              <h3 className="font-bold text-[#2D352C] mb-3">Daily Nutrition Summary</h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-[#FAF9F6] rounded-xl p-2">
                  <p className="text-lg font-bold text-[#2D352C]">{mealPlanResult.nutrition_summary.total_calories}</p>
                  <p className="text-[10px] text-[#6B7567]">Calories</p>
                </div>
                <div className="bg-[#FAF9F6] rounded-xl p-2">
                  <p className="text-lg font-bold text-[#2D352C]">{mealPlanResult.nutrition_summary.total_protein}g</p>
                  <p className="text-[10px] text-[#6B7567]">Protein</p>
                </div>
                <div className="bg-[#FAF9F6] rounded-xl p-2">
                  <p className="text-lg font-bold text-[#2D352C]">{mealPlanResult.nutrition_summary.total_carbs}g</p>
                  <p className="text-[10px] text-[#6B7567]">Carbs</p>
                </div>
                <div className="bg-[#FAF9F6] rounded-xl p-2">
                  <p className="text-lg font-bold text-[#2D352C]">{mealPlanResult.nutrition_summary.total_fat}g</p>
                  <p className="text-[10px] text-[#6B7567]">Fat</p>
                </div>
              </div>
              <p className="text-xs text-[#8B9B83] mt-2 text-center">Daily target: {mealPlanResult.calorie_target ?? mealPlanResult.nutrition_summary.daily_calories} kcal/day</p>
              {mealPlanResult.target_basis && (
                <p className="text-[10px] text-[#8B9B83] mt-1 text-center px-2">{mealPlanResult.target_basis}</p>
              )}
            </div>

            {/* Meals */}
            <div className="space-y-3">
              {mealPlanResult.meals.map((meal, i) => (
                <div key={i} className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-xl bg-[#EEF1ED] flex items-center justify-center text-3xl">
                      {MEAL_TYPE_EMOJI[meal.meal_type] ?? '\u{1F37D}'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--accent)] bg-[#EEF1ED] px-2 py-0.5 rounded-full">{meal.meal_type}</span>
                        <span className="text-[10px] text-[#8B9B83]">{meal.prep_time}</span>
                      </div>
                      <h3 className="font-bold text-[#2D352C]">{meal.name}</h3>
                      <div className="flex gap-4 mt-2 text-xs text-[#6B7567]">
                        <span>&#x1F525; {meal.calories} cal</span>
                        <span>&#x1F4AA; {meal.protein}g protein</span>
                        <span>&#x1F96C; {meal.carbs}g carbs</span>
                        <span>&#x1F9C8; {meal.fat}g fat</span>
                      </div>
                      {meal.ingredients.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-semibold text-[#6B7567] mb-1">Ingredients:</p>
                          <p className="text-xs text-[#8B9B83]">{meal.ingredients.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {mealPlanResult.recommendations.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E5EAE3] p-4 shadow-xl">
                <h3 className="font-bold text-[#2D352C] mb-2">&#x1F4A1; Recommendations</h3>
                <ul className="space-y-2">
                  {mealPlanResult.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-[#6B7567] flex items-start gap-2">
                      <span className="text-[var(--accent)] mt-0.5">&#x2022;</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={() => { setStep('goals'); setMealPlanResult(null); setError(null); }} className="w-full py-4 rounded-xl border-2 border-[#E5EAE3] font-bold text-[#6B7567]">Start Over</button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
