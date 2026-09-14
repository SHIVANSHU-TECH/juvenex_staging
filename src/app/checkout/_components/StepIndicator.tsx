'use client';

import { STEP_LABELS, type StepIndex } from './types';

interface StepIndicatorProps {
  currentStep: StepIndex;
  // intakeStepActive indicates whether step index 2 (Medical Intake) is in
  // the flow for this cart. When false (no Rx items), we visually skip it.
  intakeStepActive: boolean;
}

interface VisibleStep {
  label: string;
  index: StepIndex;
}

export default function StepIndicator({ currentStep, intakeStepActive }: StepIndicatorProps) {
  const visibleSteps: VisibleStep[] = STEP_LABELS.map((label, index) => ({
    label,
    index: index as StepIndex,
  })).filter((s) => intakeStepActive || s.index !== 2);

  const currentVisiblePos = visibleSteps.findIndex((s) => s.index === currentStep);
  const totalVisible = visibleSteps.length;
  const currentLabel = STEP_LABELS[currentStep];

  return (
    <div className="mb-6">
      {/*
        Live region — only renders the active step text and updates whenever
        currentStep changes. Screen readers read it on each transition without
        having to re-announce the whole progress bar.
      */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Step {currentVisiblePos + 1} of {totalVisible}: {currentLabel}
      </span>

      {/*
        Semantic progress list. Each li represents a checkout step; the
        active step gets aria-current="step" so AT can announce position
        without relying on a status region.
      */}
      <ol
        aria-label="Checkout progress"
        className="flex gap-2 mb-3 list-none p-0 m-0"
      >
        {visibleSteps.map((s) => {
          const reached = s.index <= currentStep;
          const isActive = s.index === currentStep;
          return (
            <li
              key={s.index}
              aria-current={isActive ? 'step' : undefined}
              className="flex-1"
            >
              <span className="sr-only">
                {`Step ${visibleSteps.findIndex((v) => v.index === s.index) + 1}: ${s.label}${
                  isActive ? ' (current)' : reached ? ' (completed)' : ''
                }`}
              </span>
              <span
                aria-hidden="true"
                className={`block h-1.5 w-full rounded-full transition-colors ${
                  reached ? 'bg-[var(--accent-strong)]' : 'bg-[#E5EAE3]'
                }`}
              />
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-[var(--text-muted)]" aria-hidden="true">
        Step {currentVisiblePos + 1} of {totalVisible} &middot; {currentLabel}
      </p>
    </div>
  );
}
