// Tailwind class fragments shared across checkout step components. Keeping
// them in one place prevents drift between the four step UIs.
export const INPUT_CLASS =
  'w-full px-4 py-3 min-h-[44px] rounded-xl bg-white border border-[#E5EAE3] text-[#2D352C] shadow-sm focus:border-[var(--accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors';

export const PRIMARY_BUTTON_CLASS =
  'flex-1 py-3.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[var(--accent-strong)] to-[var(--accent-secondary)] text-white font-semibold shadow-md shadow-[var(--accent-strong)]/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-all';

export const SECONDARY_BUTTON_CLASS =
  'flex-1 py-3.5 min-h-[44px] rounded-xl border-2 border-[#E5EAE3] text-[#6B7567] font-semibold hover:border-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2 transition-colors';

export const SECTION_CARD_CLASS =
  'bg-white rounded-2xl border border-[#E5EAE3] shadow-sm p-5';

export const CHECKBOX_CLASS =
  'w-5 h-5 rounded border-[var(--accent-strong)] text-[var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] focus-visible:ring-offset-2';

export const LABEL_CLASS = 'block text-sm font-medium text-[#2D352C] mb-2';

export const ERROR_TEXT_CLASS = 'mt-1 text-sm text-red-700';
