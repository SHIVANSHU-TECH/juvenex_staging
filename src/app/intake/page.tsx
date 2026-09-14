'use client';

import { useState, useEffect, useId, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useMembershipGate } from '@/lib/membership';
import MembershipPrompt from '@/components/MembershipPrompt';

type Step = 'goals' | 'status' | 'diet' | 'medical' | 'complete';

interface InputFieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  errorId?: string;
  children: ReactNode;
}

function InputField({ label, htmlFor, error, errorId, children }: InputFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-[#2D352C] mb-2">
        {label}
      </label>
      {children}
      {error && errorId && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

const INPUT_CLASS = "w-full px-4 py-3 min-h-[44px] rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] shadow-sm focus:border-[var(--accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors";

function chipClass(active: boolean) {
  return `px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 ${active ? 'bg-[var(--accent-strong)] border-[var(--accent-strong)] text-white shadow-sm' : 'bg-white border-[#E5EAE3] text-[#2D352C] hover:border-[var(--accent-strong)]'}`;
}

function ProgressBar({ currentStepIndex, stepLabels }: { currentStepIndex: number; stepLabels: string[] }) {
  return (
    <div className="mb-8">
      <div className="flex gap-2 mb-3" aria-hidden="true">
        {stepLabels.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= currentStepIndex ? 'bg-[var(--accent-strong)]' : 'bg-[#E5EAE3]'}`} />
        ))}
      </div>
      {currentStepIndex < stepLabels.length && (
        <p className="text-sm text-[var(--text-muted)]">
          Step {currentStepIndex + 1} of {stepLabels.length} &middot; {stepLabels[currentStepIndex]}
        </p>
      )}
    </div>
  );
}

function NavButtons({ currentStepIndex, onNext, onPrev, nextLabel = 'Continue', disabled = false }: { currentStepIndex: number; onNext: () => void; onPrev: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex gap-3 mt-8">
      {currentStepIndex > 0 && (
        <button
          type="button"
          onClick={onPrev}
          className="flex-1 py-3.5 min-h-[44px] rounded-xl border-2 border-[#E5EAE3] text-[#6B7567] font-semibold hover:border-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="flex-1 py-3.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-all"
      >
        {nextLabel}
      </button>
    </div>
  );
}

interface PageWrapperProps {
  icon: string;
  title: string;
  currentStepIndex: number;
  stepLabels: string[];
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}

function PageWrapper({ icon, title, currentStepIndex, stepLabels, headingRef, children }: PageWrapperProps) {
  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3] px-4 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to home"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#EEF1ED] hover:bg-[#E2E7E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
          >
            <svg aria-hidden="true" className="w-5 h-5 text-[#6B7567]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <p className="text-lg font-bold text-[#2D352C]">Health Profile</p>
        </div>
      </header>
      <main id="main-content" className="px-4 py-6 max-w-lg mx-auto">
        <div role="status" aria-live="polite" aria-atomic="true">
          <ProgressBar currentStepIndex={currentStepIndex} stepLabels={stepLabels} />
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl" aria-hidden="true">{icon}</span>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-bold text-[#2D352C] focus:outline-none"
            >
              {title}
            </h1>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

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
  favoriteFoods: string[];
  foodsToAvoid: string[];
  medications: string[];
  conditions: string[];
  hasGlp1Experience: boolean;
}

const ALLERGY_OPTIONS = ['Dairy', 'Gluten', 'Nuts', 'Shellfish', 'Eggs', 'Soy'];
const RESTRICTION_OPTIONS = ['Vegetarian', 'Vegan', 'Kosher', 'Halal', 'Low-sodium'];
const CONDITION_OPTIONS = ['Diabetes', 'High Blood Pressure', 'Heart Disease', 'Thyroid', 'Kidney Disease'];

const STEPS: Step[] = ['goals', 'status', 'diet', 'medical', 'complete'];
const STEP_LABELS = ['Your Goals', 'About You', 'Diet Preferences', 'Medical Info'];

export default function PatientIntakePage() {
  const membership = useMembershipGate();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>('goals');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<PatientData>({
    primaryGoal: '', targetWeight: 0, timeline: '',
    currentWeight: 0, height: 0, age: 0, gender: '', activityLevel: 'moderate',
    dietType: 'balanced', allergies: [], restrictions: [],
    favoriteFoods: [], foodsToAvoid: [], medications: [], conditions: [],
    hasGlp1Experience: false,
  });

  // Stable IDs for label/input + error wiring
  const primaryGoalId = useId();
  const targetWeightId = useId();
  const timelineId = useId();
  const currentWeightId = useId();
  const heightId = useId();
  const ageId = useId();
  const genderId = useId();
  const activityLevelId = useId();
  const dietTypeId = useId();
  const favoriteFoodsId = useId();
  const foodsToAvoidId = useId();
  const medicationsId = useId();
  const glp1Id = useId();
  const submitErrorId = useId();

  // Heading ref for focus management on step change
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Move focus to the new step's heading when step changes (silent for SR users with live region)
  useEffect(() => {
    if (headingRef.current) {
      headingRef.current.focus();
    }
  }, [step]);

  // Redirect to login if not authenticated (after all hooks)
  if (!authLoading && !isAuthenticated) {
    router.push('/login');
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading…</span>
          <div className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading…</span>
          <div className="w-8 h-8 border-4 border-[var(--accent-strong)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const updateData = (field: keyof PatientData, value: unknown) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArray = (field: 'allergies' | 'restrictions' | 'conditions', item: string) => {
    const current = data[field];
    const updated = current.includes(item) ? current.filter(i => i !== item) : [...current, item];
    updateData(field, updated);
  };

  const currentStepIndex = STEPS.indexOf(step);
  const nextStep = () => { if (currentStepIndex < STEPS.length - 1) setStep(STEPS[currentStepIndex + 1]); };
  const prevStep = () => { if (currentStepIndex > 0) setStep(STEPS[currentStepIndex - 1]); };
  // Deterministic, made once membership state resolves. Hard gate: not
  // dismissible, so it can't be clicked away to bypass the paywall and can't
  // re-trigger in a loop.
  const showIntakeMembershipPrompt = !membership.loading && !membership.active;
  const renderWithMembershipPrompt = (children: ReactNode) => (
    <>
      {children}
      {showIntakeMembershipPrompt && (
        <MembershipPrompt
          title="Choose a membership to continue intake"
          description="Health intake is part of the Juvenex member experience. Choose a tier to unlock telehealth access, goal tracking, and product purchasing."
          ctaBase="/upgrade?from=/intake"
          dismissible={false}
          closeLabel="Leave intake"
          onClose={() => router.push('/')}
        />
      )}
    </>
  );

  const submitProfile = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) {
        router.push('/login');
        return;
      }
      const res = await fetch('/api/patient/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_weight: data.currentWeight || undefined,
          target_weight: data.targetWeight || undefined,
          height: data.height || undefined,
          age: data.age || undefined,
          gender: data.gender || undefined,
          activity_level: data.activityLevel,
          diet_type: data.dietType,
          primary_goal: data.primaryGoal || 'weight_loss',
          allergies: data.allergies,
          restrictions: data.restrictions,
          favorite_foods: data.favoriteFoods,
          foods_to_avoid: data.foodsToAvoid,
          conditions: data.conditions,
          medications: data.medications,
          has_glp1_experience: data.hasGlp1Experience,
        })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'Failed to save profile');
      }
      nextStep();
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: Goals
  if (step === 'goals') {
    return renderWithMembershipPrompt(
      <PageWrapper currentStepIndex={currentStepIndex} stepLabels={STEP_LABELS} icon="🎯" title="What are your goals?" headingRef={headingRef}>
        <div className="space-y-5">
          <InputField label="Primary Goal" htmlFor={primaryGoalId}>
            <select id={primaryGoalId} value={data.primaryGoal} onChange={(e) => updateData('primaryGoal', e.target.value)} className={INPUT_CLASS}>
              <option value="">Select a goal...</option>
              <option value="weight_loss">Lose Weight</option>
              <option value="maintain">Maintain Weight</option>
              <option value="muscle_gain">Build Muscle</option>
              <option value="glp1_optimize">Optimize GLP-1 Results</option>
              <option value="blood_sugar">Manage Blood Sugar</option>
            </select>
          </InputField>

          <InputField label="Target Weight (lbs)" htmlFor={targetWeightId}>
            <input id={targetWeightId} type="number" value={data.targetWeight || ''} onChange={(e) => updateData('targetWeight', parseInt(e.target.value))}
              placeholder="e.g., 150" className={INPUT_CLASS} />
          </InputField>

          <InputField label="Timeline" htmlFor={timelineId}>
            <select id={timelineId} value={data.timeline} onChange={(e) => updateData('timeline', e.target.value)} className={INPUT_CLASS}>
              <option value="">Select timeline...</option>
              <option value="1_month">1 Month</option>
              <option value="3_months">3 Months</option>
              <option value="6_months">6 Months</option>
              <option value="1_year">1 Year</option>
            </select>
          </InputField>
        </div>
        <NavButtons currentStepIndex={currentStepIndex} onPrev={prevStep} onNext={nextStep} disabled={!data.primaryGoal || !data.targetWeight} />
      </PageWrapper>
    );
  }

  // Step 2: Current Status
  if (step === 'status') {
    return renderWithMembershipPrompt(
      <PageWrapper currentStepIndex={currentStepIndex} stepLabels={STEP_LABELS} icon="📊" title="Tell us about yourself" headingRef={headingRef}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Current Weight (lbs)" htmlFor={currentWeightId}>
              <input id={currentWeightId} type="number" value={data.currentWeight || ''} onChange={(e) => updateData('currentWeight', parseInt(e.target.value))}
                placeholder="e.g., 180" className={INPUT_CLASS} />
            </InputField>
            <InputField label="Height (inches)" htmlFor={heightId}>
              <input id={heightId} type="number" value={data.height || ''} onChange={(e) => updateData('height', parseInt(e.target.value))}
                placeholder="e.g., 67" className={INPUT_CLASS} />
            </InputField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <InputField label="Age" htmlFor={ageId}>
              <input id={ageId} type="number" value={data.age || ''} onChange={(e) => updateData('age', parseInt(e.target.value))}
                placeholder="e.g., 35" className={INPUT_CLASS} />
            </InputField>
            <InputField label="Gender" htmlFor={genderId}>
              <select id={genderId} value={data.gender} onChange={(e) => updateData('gender', e.target.value)} className={INPUT_CLASS}>
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </InputField>
          </div>

          <InputField label="Activity Level" htmlFor={activityLevelId}>
            <select id={activityLevelId} value={data.activityLevel} onChange={(e) => updateData('activityLevel', e.target.value)} className={INPUT_CLASS}>
              <option value="sedentary">Sedentary (little exercise)</option>
              <option value="light">Light (1-3 days/week)</option>
              <option value="moderate">Moderate (3-5 days/week)</option>
              <option value="active">Active (6-7 days/week)</option>
              <option value="very_active">Very Active (athlete)</option>
            </select>
          </InputField>
        </div>
        <NavButtons currentStepIndex={currentStepIndex} onPrev={prevStep} onNext={nextStep} />
      </PageWrapper>
    );
  }

  // Step 3: Diet Preferences
  if (step === 'diet') {
    return renderWithMembershipPrompt(
      <PageWrapper currentStepIndex={currentStepIndex} stepLabels={STEP_LABELS} icon="🍴" title="Diet & Preferences" headingRef={headingRef}>
        <div className="space-y-6">
          <InputField label="Diet Type" htmlFor={dietTypeId}>
            <select id={dietTypeId} value={data.dietType} onChange={(e) => updateData('dietType', e.target.value)} className={INPUT_CLASS}>
              <option value="balanced">Balanced</option>
              <option value="keto">Keto</option>
              <option value="low_carb">Low Carb</option>
              <option value="mediterranean">Mediterranean</option>
              <option value="paleo">Paleo</option>
              <option value="low_fat">Low Fat</option>
            </select>
          </InputField>

          <fieldset>
            <legend className="block text-sm font-medium text-[#2D352C] mb-2">Allergies</legend>
            <div className="flex flex-wrap gap-2">
              {ALLERGY_OPTIONS.map(a => {
                const active = data.allergies.includes(a);
                return (
                  <button
                    type="button"
                    key={a}
                    onClick={() => toggleArray('allergies', a)}
                    aria-pressed={active}
                    className={chipClass(active)}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="block text-sm font-medium text-[#2D352C] mb-2">Dietary Restrictions</legend>
            <div className="flex flex-wrap gap-2">
              {RESTRICTION_OPTIONS.map(r => {
                const active = data.restrictions.includes(r);
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => toggleArray('restrictions', r)}
                    aria-pressed={active}
                    className={chipClass(active)}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <InputField label="Foods You Love (comma separated)" htmlFor={favoriteFoodsId}>
            <input id={favoriteFoodsId} type="text" onChange={(e) => updateData('favoriteFoods', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Salmon, Avocado, Chicken" className={INPUT_CLASS} />
          </InputField>

          <InputField label="Foods to Avoid (comma separated)" htmlFor={foodsToAvoidId}>
            <input id={foodsToAvoidId} type="text" onChange={(e) => updateData('foodsToAvoid', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Dairy, Bread, Sugar" className={INPUT_CLASS} />
          </InputField>
        </div>
        <NavButtons currentStepIndex={currentStepIndex} onPrev={prevStep} onNext={nextStep} />
      </PageWrapper>
    );
  }

  // Step 4: Medical
  if (step === 'medical') {
    return renderWithMembershipPrompt(
      <PageWrapper currentStepIndex={currentStepIndex} stepLabels={STEP_LABELS} icon="🏥" title="Medical History" headingRef={headingRef}>
        <div className="space-y-6">
          <fieldset>
            <legend className="block text-sm font-medium text-[#2D352C] mb-2">Health Conditions</legend>
            <div className="flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map(c => {
                const active = data.conditions.includes(c);
                return (
                  <button
                    type="button"
                    key={c}
                    onClick={() => toggleArray('conditions', c)}
                    aria-pressed={active}
                    className={chipClass(active)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <InputField label="Current Medications (comma separated)" htmlFor={medicationsId}>
            <input id={medicationsId} type="text" onChange={(e) => updateData('medications', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Metformin, Lisinopril" className={INPUT_CLASS} />
          </InputField>

          <div className="bg-[#EEF1ED] border border-[#D8DFD5] rounded-xl p-4">
            <label htmlFor={glp1Id} className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <input
                id={glp1Id}
                type="checkbox"
                checked={data.hasGlp1Experience}
                onChange={(e) => updateData('hasGlp1Experience', e.target.checked)}
                className="w-5 h-5 rounded border-[var(--accent-strong)] text-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              />
              <span className="text-[#2D352C] font-medium">I have used GLP-1 medication before</span>
            </label>
          </div>

          {submitError && (
            <div
              id={submitErrorId}
              role="alert"
              className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start justify-between gap-2"
            >
              <p className="text-sm text-red-700">{submitError}</p>
              <button
                type="button"
                onClick={() => setSubmitError(null)}
                aria-label="Dismiss error"
                className="min-h-[44px] min-w-[44px] -m-2 p-2 inline-flex items-center justify-center rounded-md text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          )}
        </div>
        <NavButtons currentStepIndex={currentStepIndex} onPrev={prevStep} onNext={submitProfile} nextLabel={submitting ? 'Saving...' : 'Save & Generate Meal Plan'} disabled={submitting} />
      </PageWrapper>
    );
  }

  // Complete
  return renderWithMembershipPrompt(
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-4">
      <main id="main-content" className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-[#EEF1ED] flex items-center justify-center text-4xl mx-auto mb-6" aria-hidden="true">
          ✅
        </div>
        <h1 className="text-2xl font-bold text-[#2D352C] mb-3">Profile Complete!</h1>
        <p className="text-[#6B7567] mb-8">Your personalized health profile has been saved. Let&apos;s generate your meal plan.</p>
        <button
          type="button"
          onClick={() => router.push('/meals')}
          className="w-full py-4 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-bold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-all"
        >
          View My Meal Plan
        </button>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 min-h-[44px] mt-3 rounded-xl text-[#6B7567] font-medium hover:bg-[#EEF1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors"
        >
          Back to Dashboard
        </button>
      </main>
    </div>
  );
}
