'use client';

import { useId, useState } from 'react';
import {
  CONDITION_OPTIONS,
  intakeSchema,
  type IntakeValues,
} from './types';
import {
  CHECKBOX_CLASS,
  ERROR_TEXT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SECTION_CARD_CLASS,
} from './ui';

interface IntakeFormProps {
  initial: IntakeValues;
  onBack: () => void;
  onContinue: (values: IntakeValues) => void;
}

type FieldErrors = Partial<Record<string, string>>;

export default function IntakeForm({ initial, onBack, onContinue }: IntakeFormProps) {
  const [values, setValues] = useState<IntakeValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Today's date (YYYY-MM-DD) — caps the DOB picker so future dates can't be
  // selected. Computed once via the initializer so it stays stable across
  // re-renders. The zod schema enforces the same rule plus the 18+ minimum.
  const [maxDob] = useState(() => new Date().toISOString().slice(0, 10));

  const idDob = useId();
  const idSex = useId();
  const idWeight = useId();
  const idFt = useId();
  const idIn = useId();
  const idPregnant = useId();
  const idAllergies = useId();
  const idMeds = useId();
  const idOther = useId();
  const idPriorWhich = useId();
  const idPriorDuration = useId();
  const idHipaa = useId();
  const idTele = useId();
  const errorSummaryId = useId();
  const consentHintId = useId();

  // Map zod-issue field keys (e.g. "dob", "weightLbs") to the DOM id of the
  // input that field renders to. This lets the submit handler move focus to
  // the first invalid input without each branch knowing about the others.
  const fieldDomId: Partial<Record<string, string>> = {
    dob: idDob,
    sex: idSex,
    weightLbs: idWeight,
    heightFeet: idFt,
    heightInches: idIn,
    pregnant: idPregnant,
    allergies: idAllergies,
    currentMedications: idMeds,
    conditionsOther: idOther,
    priorGlp1Which: idPriorWhich,
    priorGlp1Duration: idPriorDuration,
    hipaaConsent: idHipaa,
    telehealthConsent: idTele,
  };

  // Each error needs a stable DOM id so the matching input can reference it
  // via aria-describedby. We derive it from the field's input id to avoid a
  // separate useId per field.
  const errId = (field: string) => {
    const base = fieldDomId[field];
    if (base) return `${base}-error`;
    return `intake-${field}-error`;
  };

  const update = <K extends keyof IntakeValues>(field: K, value: IntakeValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCondition = (option: string) => {
    setValues((prev) => {
      const exists = prev.conditions.includes(option);
      return {
        ...prev,
        conditions: exists
          ? prev.conditions.filter((c) => c !== option)
          : [...prev.conditions, option],
      };
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = intakeSchema.safeParse(values);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key) next[key] = issue.message;
      }
      setErrors(next);
      // Move focus to the first invalid field so keyboard / screen reader
      // users land on the actual problem instead of having to scan the form.
      // Defer to the next paint so the error markup has rendered.
      const firstKey = Object.keys(next)[0];
      const targetId = firstKey ? fieldDomId[firstKey] : undefined;
      if (targetId && typeof document !== 'undefined') {
        requestAnimationFrame(() => {
          document.getElementById(targetId)?.focus();
        });
      }
      return;
    }
    setErrors({});
    onContinue(result.data);
  };

  const consentsReady = values.hipaaConsent && values.telehealthConsent;

  return (
    <form onSubmit={handleSubmit} className={SECTION_CARD_CLASS} noValidate>
      <h2 className="text-lg font-bold text-[#2D352C] mb-1">Medical intake</h2>
      <p className="text-sm text-[var(--text-muted)] mb-2">
        Required for prescription items. Information is shared only with your reviewing provider.
      </p>
      <p className="text-sm text-[var(--text-muted)] mb-5">
        Fields marked with <span className="text-red-600" aria-hidden="true">*</span> are required.
      </p>
      {/* Error summary lives at the top of the form so screen reader users
          hear an assertive count of remaining problems instead of having to
          tab through every input to find them. */}
      <div
        id={errorSummaryId}
        role="alert"
        aria-live="assertive"
        className="sr-only"
      >
        {Object.keys(errors).length > 0
          ? `${Object.keys(errors).length} ${Object.keys(errors).length === 1 ? 'field needs' : 'fields need'} attention before continuing.`
          : ''}
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={idDob} className={LABEL_CLASS}>
              Date of birth<span className="text-red-600" aria-hidden="true"> *</span>
            </label>
            <input
              id={idDob}
              type="date"
              value={values.dob}
              max={maxDob}
              onChange={(e) => update('dob', e.target.value)}
              aria-required="true"
              aria-invalid={errors.dob ? 'true' : undefined}
              aria-describedby={errors.dob ? errId('dob') : undefined}
              className={INPUT_CLASS}
            />
            {errors.dob && (
              <p id={errId('dob')} className={ERROR_TEXT_CLASS} role="alert">{errors.dob}</p>
            )}
          </div>
          <div>
            <label htmlFor={idSex} className={LABEL_CLASS}>
              Sex assigned at birth<span className="text-red-600" aria-hidden="true"> *</span>
            </label>
            <select
              id={idSex}
              value={values.sex}
              onChange={(e) => update('sex', e.target.value as IntakeValues['sex'])}
              aria-required="true"
              className={INPUT_CLASS}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={idWeight} className={LABEL_CLASS}>
              Current weight (lbs)<span className="text-red-600" aria-hidden="true"> *</span>
            </label>
            <input
              id={idWeight}
              type="number"
              min={1}
              value={values.weightLbs || ''}
              onChange={(e) => update('weightLbs', Number(e.target.value))}
              aria-required="true"
              aria-invalid={errors.weightLbs ? 'true' : undefined}
              aria-describedby={errors.weightLbs ? errId('weightLbs') : undefined}
              className={INPUT_CLASS}
            />
            {errors.weightLbs && (
              <p id={errId('weightLbs')} className={ERROR_TEXT_CLASS} role="alert">{errors.weightLbs}</p>
            )}
          </div>
          <div>
            <span className={LABEL_CLASS}>
              Height<span className="text-red-600" aria-hidden="true"> *</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={idFt} className="sr-only">Feet</label>
                <input
                  id={idFt}
                  type="number"
                  min={0}
                  placeholder="ft"
                  value={values.heightFeet || ''}
                  onChange={(e) => update('heightFeet', Number(e.target.value))}
                  aria-required="true"
                  aria-label="Height in feet"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor={idIn} className="sr-only">Inches</label>
                <input
                  id={idIn}
                  type="number"
                  min={0}
                  max={11}
                  placeholder="in"
                  value={values.heightInches || ''}
                  onChange={(e) => update('heightInches', Number(e.target.value))}
                  aria-required="true"
                  aria-label="Height in inches"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor={idPregnant} className={LABEL_CLASS}>
            Pregnant or breastfeeding?<span className="text-red-600" aria-hidden="true"> *</span>
          </label>
          <select
            id={idPregnant}
            value={values.pregnant}
            onChange={(e) => update('pregnant', e.target.value as IntakeValues['pregnant'])}
            aria-required="true"
            className={INPUT_CLASS}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
            <option value="na">Not applicable</option>
          </select>
        </div>

        <div>
          <label htmlFor={idAllergies} className={LABEL_CLASS}>Allergies</label>
          <textarea
            id={idAllergies}
            rows={3}
            value={values.allergies}
            onChange={(e) => update('allergies', e.target.value)}
            placeholder="List any drug or food allergies"
            className={`${INPUT_CLASS} resize-y`}
          />
        </div>

        <div>
          <label htmlFor={idMeds} className={LABEL_CLASS}>Current medications</label>
          <textarea
            id={idMeds}
            rows={3}
            value={values.currentMedications}
            onChange={(e) => update('currentMedications', e.target.value)}
            placeholder="Include name, dose, and frequency"
            className={`${INPUT_CLASS} resize-y`}
          />
        </div>

        <fieldset>
          <legend className={LABEL_CLASS}>Medical conditions</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONDITION_OPTIONS.map((option) => {
              const checked = values.conditions.includes(option);
              // Stable id derived from the option label so each checkbox can
              // be programmatically associated with its visible label and so
              // browser/test tooling can target it by name.
              // Normalise to lowercase a-z/0-9/dash so slashes and other
              // option characters can't produce invalid CSS-selector ids.
              const conditionId = `condition-${option
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')}`;
              return (
                <label
                  key={option}
                  htmlFor={conditionId}
                  className={`flex items-center gap-3 px-3 py-2 min-h-[44px] rounded-xl border transition-colors cursor-pointer ${
                    checked
                      ? 'bg-[#EEF1ED] border-[var(--accent-strong)]'
                      : 'bg-white border-[#E5EAE3] hover:border-[var(--accent-strong)]'
                  }`}
                >
                  <input
                    id={conditionId}
                    name="conditions"
                    type="checkbox"
                    value={option}
                    checked={checked}
                    onChange={() => toggleCondition(option)}
                    className={CHECKBOX_CLASS}
                  />
                  <span className="text-sm text-[#2D352C]">{option}</span>
                </label>
              );
            })}
          </div>
          {values.conditions.includes('Other') && (
            <div className="mt-3">
              <label htmlFor={idOther} className={LABEL_CLASS}>Other (please specify)</label>
              <input
                id={idOther}
                type="text"
                value={values.conditionsOther ?? ''}
                onChange={(e) => update('conditionsOther', e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className={LABEL_CLASS}>Prior GLP-1 use?</legend>
          <div className="flex gap-2">
            {/*
              The radio input is sr-only so the native focus ring is invisible.
              We forward focus styling onto the visible pill (the wrapping
              label) via `has-[:focus-visible]` and the `focus-within` fallback
              so keyboard users always see which option is focused.
            */}
            <label className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[var(--accent-strong)] focus-within:ring-offset-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent-strong)] has-[:focus-visible]:ring-offset-2 ${values.priorGlp1 === 'no' ? 'bg-[var(--accent-strong)] border-[var(--accent-strong)] text-white' : 'bg-white border-[#E5EAE3] text-[#2D352C]'}`}>
              <input
                type="radio"
                name="priorGlp1"
                checked={values.priorGlp1 === 'no'}
                onChange={() => update('priorGlp1', 'no')}
                className="peer sr-only"
              />
              No
            </label>
            <label className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[var(--accent-strong)] focus-within:ring-offset-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--accent-strong)] has-[:focus-visible]:ring-offset-2 ${values.priorGlp1 === 'yes' ? 'bg-[var(--accent-strong)] border-[var(--accent-strong)] text-white' : 'bg-white border-[#E5EAE3] text-[#2D352C]'}`}>
              <input
                type="radio"
                name="priorGlp1"
                checked={values.priorGlp1 === 'yes'}
                onChange={() => update('priorGlp1', 'yes')}
                className="peer sr-only"
              />
              Yes
            </label>
          </div>
          {values.priorGlp1 === 'yes' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label htmlFor={idPriorWhich} className={LABEL_CLASS}>Which medication?</label>
                <input
                  id={idPriorWhich}
                  type="text"
                  value={values.priorGlp1Which ?? ''}
                  onChange={(e) => update('priorGlp1Which', e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor={idPriorDuration} className={LABEL_CLASS}>Duration</label>
                <input
                  id={idPriorDuration}
                  type="text"
                  placeholder="e.g., 6 months"
                  value={values.priorGlp1Duration ?? ''}
                  onChange={(e) => update('priorGlp1Duration', e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}
        </fieldset>

        <div className="bg-[#EEF1ED] border border-[#D8DFD5] rounded-xl p-4 space-y-3">
          <label htmlFor={idHipaa} className="flex items-start gap-3 cursor-pointer">
            <input
              id={idHipaa}
              type="checkbox"
              checked={values.hipaaConsent}
              onChange={(e) => update('hipaaConsent', e.target.checked)}
              aria-required="true"
              aria-invalid={errors.hipaaConsent ? 'true' : undefined}
              aria-describedby={errors.hipaaConsent ? errId('hipaaConsent') : undefined}
              className={`${CHECKBOX_CLASS} mt-1`}
            />
            <span className="text-sm text-[#2D352C]">
              <span className="text-red-600" aria-hidden="true">* </span>
              I consent to share this medical information with Juvenex providers and authorized
              prescribing partners (PrescribeRx) for the purpose of evaluating this order. I
              understand this is protected health information.
            </span>
          </label>
          {errors.hipaaConsent && (
            <p id={errId('hipaaConsent')} className={ERROR_TEXT_CLASS} role="alert">{errors.hipaaConsent}</p>
          )}

          <label htmlFor={idTele} className="flex items-start gap-3 cursor-pointer">
            <input
              id={idTele}
              type="checkbox"
              checked={values.telehealthConsent}
              onChange={(e) => update('telehealthConsent', e.target.checked)}
              aria-required="true"
              aria-invalid={errors.telehealthConsent ? 'true' : undefined}
              aria-describedby={errors.telehealthConsent ? errId('telehealthConsent') : undefined}
              className={`${CHECKBOX_CLASS} mt-1`}
            />
            <span className="text-sm text-[#2D352C]">
              <span className="text-red-600" aria-hidden="true">* </span>
              I consent to receive a telehealth evaluation by a licensed clinician for the purpose
              of this order.
            </span>
          </label>
          {errors.telehealthConsent && (
            <p id={errId('telehealthConsent')} className={ERROR_TEXT_CLASS} role="alert">{errors.telehealthConsent}</p>
          )}
        </div>
      </div>

      {!consentsReady && (
        <p
          id={consentHintId}
          className="mt-4 text-sm text-[var(--text-muted)]"
        >
          Please confirm both consents above to continue.
        </p>
      )}

      <div className="flex gap-3 mt-4">
        <button type="button" onClick={onBack} className={SECONDARY_BUTTON_CLASS}>
          Back
        </button>
        <button
          type="submit"
          disabled={!consentsReady}
          aria-disabled={!consentsReady ? 'true' : undefined}
          aria-describedby={!consentsReady ? consentHintId : undefined}
          className={PRIMARY_BUTTON_CLASS}
        >
          Continue to payment
        </button>
      </div>
    </form>
  );
}
