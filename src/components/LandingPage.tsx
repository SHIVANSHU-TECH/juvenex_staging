'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const DEMO_BOOKING_URL = 'https://api.leadconnectorhq.com/widget/booking/gVh2fiFZk3weNu2ldZ9f';

const features = [
  {
    id: 'weight',
    title: 'Weight and goal tracking',
    desc: 'Track weight, habits, milestones, and body recomposition goals.',
  },
  {
    id: 'meals',
    title: 'Personalized meals',
    desc: 'Recipes tuned around appetite, protein, and GLP-1 tolerance.',
  },
  {
    id: 'glp1',
    title: 'GLP-1 protocol tracking',
    desc: 'Follow dosing, refills, side effects, and provider guidance.',
  },
  {
    id: 'community',
    title: 'Community and profile',
    desc: 'Build your profile, post updates, and learn from real results.',
  },
] as const;

const membershipTiers = [
  {
    label: 'Starter',
    name: 'Weight loss protocol',
    price: '$95',
    desc: '$95/mo for platform access: weight, meal, and protocol tracking, the community, and the ability to consult a licensed provider about GLP-1 and peptide options.',
    points: ['Weight loss protocol', 'GLPs, Semaglutide, and Tirzepatide access', 'Talk to a telehealth doctor'],
    href: '/telehealth',
  },
  {
    label: 'Most popular',
    name: 'Weight loss + 1 protocol',
    price: '$129',
    desc: '$129 includes weight loss plus one protocol of choice: metabolic, growth, or sexual health.',
    points: ['Weight loss protocol included', 'Choose 1 additional protocol', 'Metabolic, growth, or sexual health option'],
    href: '/telehealth',
    featured: true,
  },
  {
    label: 'Recomposition',
    name: 'Choose three protocols',
    price: '$179',
    desc: '$179 lets members choose three protocols for a broader Juvenex program.',
    points: ['Choose 3 protocols', 'Weight loss, metabolic, growth, or sexual health', 'Expanded marketplace access'],
    href: '/telehealth',
  },
  {
    label: 'Unlimited',
    name: 'Unlimited',
    price: '$219',
    desc: '$219 gives unlimited access to all available protocols.',
    points: ['All protocols included', 'Unlimited marketplace access', 'Personalized ongoing support'],
    href: '/telehealth',
  },
];

const meals = [
  ['Greek yogurt bowl', '28g', '24g', '14g'],
  ['Lemon-herb salmon', '38g', '22g', '18g'],
  ['Miso tofu quinoa', '32g', '30g', '12g'],
  ['Chicken tahini plate', '42g', '26g', '16g'],
  ['Garlic shrimp rice', '34g', '14g', '12g'],
];

const footerGroups = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Membership', href: '#membership' },
      { label: 'How it works', href: '#how-it-works' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'For providers', href: '/organization' },
      { label: 'Contact', href: '/organization' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Terms', href: '/legal/terms' },
    ],
  },
] as const;

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7h10m0 0L8 3m4 4L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {open ? (
        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#1F2A1C] px-5 py-3 text-sm font-semibold text-[#FAF9F6] transition hover:-translate-y-0.5 hover:bg-[#2D3D29] focus-visible:outline-[var(--accent-strong)]">
      {children}
      <ArrowIcon className="transition group-hover:translate-x-0.5" />
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#CFC9B7] px-5 py-3 text-sm font-semibold text-[#1F2A1C] transition hover:border-[#1F2A1C] hover:bg-white/40">
      {children}
    </Link>
  );
}

function DemoLink({ variant = 'light' }: { variant?: 'dark' | 'light' }) {
  const className = variant === 'dark'
    ? 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#FAF9F6] px-6 text-sm font-bold text-[#1F2A1C] transition hover:bg-white'
    : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#1F2A1C] px-5 py-3 text-sm font-semibold text-[#1F2A1C] transition hover:-translate-y-0.5 hover:bg-white/60';

  return (
    <a href={DEMO_BOOKING_URL} target="_blank" rel="noopener noreferrer" className={className}>
      Book a demo
      <ArrowIcon />
    </a>
  );
}

function HeroPreview() {
  return (
    <div className="landing-rise rounded-[18px] border border-[#E0DDD0] bg-white p-4 shadow-[0_20px_50px_-35px_rgba(31,42,28,.45)]">
      <div className="flex items-center justify-between border-b border-[#E0DDD0] pb-4">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">SK</div>
          <div>
            <p className="text-sm font-bold">Sarah K.</p>
            <p className="text-xs text-[#6B7567]">Personalized profile - Week 12</p>
          </div>
        </div>
        <span className="rounded-full bg-[#EAF0E5] px-3 py-1 text-xs font-bold text-[var(--accent-strong)]">On track</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ['Weight', '-18', 'lbs'],
          ['Protein', '124', 'g'],
          ['GLP-1', 'Week', '12'],
        ].map(([label, value, unit]) => (
          <div key={label} className="rounded-xl bg-[#F2EFE7] p-3">
            <p className="text-[10px] uppercase tracking-[.08em] text-[#6B7567]">{label}</p>
            <p className="mt-1 text-xl font-bold">{value}<span className="ml-1 text-xs font-medium text-[#6B7567]">{unit}</span></p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-[#F2EFE7] p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-[#6B7567]">
          <span>Weight trend - 12 weeks</span>
          <span>Goal: -24 lbs</span>
        </div>
        <svg viewBox="0 0 320 90" className="h-36 w-full" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="heroArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5C7A4F" stopOpacity=".30" />
              <stop offset="100%" stopColor="#5C7A4F" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,62 C 30,42 58,66 88,46 S 148,28 178,40 S 235,66 275,36 L 320,30 L 320,90 L 0,90 Z" fill="url(#heroArea)" />
          <path className="landing-draw-line" d="M0,62 C 30,42 58,66 88,46 S 148,28 178,40 S 235,66 275,36 L 320,30" fill="none" stroke="#3C5A30" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>

      <div className="mt-3 divide-y divide-[#E0DDD0]">
        {[
          ['GLP-1 protocol', 'Next dose and refill tracked', 'Wed'],
          ['Community update', '3 replies on your progress post', 'Today'],
        ].map(([title, detail, time]) => (
          <div key={title} className="flex items-center gap-3 py-3">
            <div className="size-9 rounded-lg bg-[#F2EFE7]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="truncate text-xs text-[#6B7567]">{detail}</p>
            </div>
            <p className="text-xs font-bold text-[#2D352C]">{time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturePanel({ active }: { active: string }) {
  const [mealIndex, setMealIndex] = useState(1);
  const meal = meals[mealIndex];

  if (active === 'meals') {
    return (
      <div className="landing-panel">
        <div className="landing-panel-head">
          <div>
            <p className="text-sm font-bold">Meal plan</p>
            <p className="text-xs text-[#6B7567]">This week</p>
          </div>
          <span>Personalized</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, index) => (
            <button key={day} type="button" onClick={() => setMealIndex(index)} className={`min-h-11 rounded-lg text-xs font-bold transition ${mealIndex === index ? 'bg-[#1F2A1C] text-[#FAF9F6]' : 'bg-[#F2EFE7] text-[#6B7567] hover:bg-[#EAE6DA]'}`}>
              {day}
            </button>
          ))}
        </div>
        <div className="flex min-h-72 flex-col justify-between rounded-xl border border-[#E0DDD0] bg-gradient-to-br from-[#F5F2E8] to-[#EAE6DA] p-6">
          <div>
            <p className="text-xs uppercase tracking-[.14em] text-[#6B7567]">Lunch - 28 min</p>
            <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-[-.02em]">{meal[0]}</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['Protein', 'Carbs', 'Fat'].map((label, index) => (
              <div key={label} className="rounded-lg bg-white/70 p-3">
                <p className="text-[10px] uppercase tracking-[.08em] text-[#6B7567]">{label}</p>
                <p className="mt-1 text-lg font-bold">{meal[index + 1]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (active === 'glp1') {
    return (
      <div className="landing-panel">
        <div className="landing-panel-head">
          <div>
            <p className="text-sm font-bold">GLP-1 and peptide consult</p>
            <p className="text-xs text-[#6B7567]">Talk to a telehealth doctor</p>
          </div>
          <span>Clinical</span>
        </div>
        <div className="relative flex min-h-96 flex-col gap-3 overflow-hidden rounded-xl bg-[#F7F5EF] p-4">
          <p className="landing-chat self-start">A licensed telehealth doctor can review your intake and discuss GLPs and other peptide options.</p>
          <p className="landing-chat landing-chat-you self-end">Can they help me choose the right protocol?</p>
          <p className="landing-chat self-start">Yes. They can recommend a plan, explain dosing, and help you track progress in the app.</p>
          <div className="mt-auto flex min-h-12 items-center rounded-full bg-white px-4 text-sm text-[#6B7567]">
            Ask about GLPs or peptides...
            <span className="ml-auto grid size-8 place-items-center rounded-full bg-[#1F2A1C] text-[#FAF9F6]"><ArrowIcon /></span>
          </div>
        </div>
      </div>
    );
  }

  if (active === 'community') {
    return (
      <div className="landing-panel">
        <div className="landing-panel-head">
          <div>
            <p className="text-sm font-bold">Community feed</p>
            <p className="text-xs text-[#6B7567]">Profile, posts, updates</p>
          </div>
          <span>Driven together</span>
        </div>
        <div className="grid gap-4 md:grid-cols-[1.35fr_.9fr]">
          <div className="rounded-xl bg-[#1F2A1C] p-6 text-[#F5F2E8]">
            <p className="text-xs uppercase tracking-[.12em] text-[#B5B7AC]">Profile update</p>
            <p className="mt-10 text-5xl font-semibold tracking-[-.04em]">-18.4<span className="ml-2 text-base text-[#B5B7AC]">lbs</span></p>
            <span className="mt-4 inline-flex rounded-full bg-[var(--accent)]/25 px-3 py-1 text-xs font-bold text-[#BFD1BA]">Posted to the news feed</span>
          </div>
          <div className="grid gap-3">
            <div className="rounded-xl bg-[#F2EFE7] p-5 text-sm text-[#6B7567]">Comments <strong className="block text-3xl text-[#1F2A1C]">18</strong></div>
            <div className="rounded-xl bg-[#F2EFE7] p-5 text-sm text-[#6B7567]">Goal streak <strong className="block text-3xl text-[#1F2A1C]">12 days</strong></div>
          </div>
        </div>
        <div className="space-y-3 border-t border-[#E0DDD0] pt-5">
          {[
            ['Maria', 'Down 6 lbs this month. Meal prep finally clicked.'],
            ['James', 'Doctor adjusted my protocol and nausea improved.'],
            ['Sarah', 'Posted new progress photo to my profile.'],
          ].map(([name, update]) => (
            <div key={name} className="flex gap-3 rounded-xl bg-[#F7F5EF] p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">{name[0]}</span>
              <div>
                <p className="text-sm font-bold">{name}</p>
                <p className="text-sm text-[#6B7567]">{update}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
      <div className="landing-panel">
        <div className="landing-panel-head">
          <div>
          <p className="text-sm font-bold">Weight goals</p>
          <p className="text-xs text-[#6B7567]">12-week progress</p>
        </div>
        <span>On track</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Total lost', '-18.4', 'lbs'],
          ['Goal', '-24', 'lbs'],
          ['Streak', '12', 'days'],
        ].map(([label, value, unit]) => (
          <div key={label} className="rounded-xl bg-[#F2EFE7] p-4">
            <p className="text-[10px] uppercase tracking-[.08em] text-[#6B7567]">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}<span className="ml-1 text-xs font-medium text-[#6B7567]">{unit}</span></p>
          </div>
        ))}
      </div>
      <div className="flex-1 rounded-xl bg-[#F2EFE7] p-5">
        <svg viewBox="0 0 380 190" className="h-72 w-full" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="featureArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5C7A4F" stopOpacity=".28" />
              <stop offset="100%" stopColor="#5C7A4F" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,130 C40,96 80,148 120,106 S200,62 240,84 S320,148 360,74 L380,84 L380,190 L0,190 Z" fill="url(#featureArea)" />
          <path className="landing-draw-line" d="M0,130 C40,96 80,148 120,106 S200,62 240,84 S320,148 360,74 L380,84" fill="none" stroke="#3C5A30" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [activeFeature, setActiveFeature] = useState<(typeof features)[number]['id']>('weight');
  const [activeMedication, setActiveMedication] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeIndex = useMemo(() => features.findIndex((feature) => feature.id === activeFeature), [activeFeature]);
  const navItems = [
    ['Features', '#features'],
    ['Membership', '#membership'],
    ['How it works', '#how-it-works'],
    ['For providers', '/white-label'],
  ] as const;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveFeature((current) => {
        const index = features.findIndex((feature) => feature.id === current);
        return features[(index + 1) % features.length].id;
      });
    }, 5600);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] text-[#1F2A1C]">
      <header className="sticky top-0 z-[70] border-b border-[#E0DDD0] bg-[#FAF9F6]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Juvenex home">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#E0DDD0] bg-white shadow-sm">
              <Image src="/juvenex-logo.jpg" alt="" width={56} height={56} priority className="h-full w-full object-cover object-center" />
            </span>
            <span className="text-lg font-bold tracking-[-.01em]">Juvenex</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Landing navigation">
            {navItems.map(([label, href]) => (
              <Link key={label} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-[#2D352C] transition hover:bg-white/55">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden min-h-10 items-center rounded-full border border-[#CFC9B7] px-4 text-sm font-semibold transition hover:border-[#1F2A1C] sm:inline-flex">
              Sign in
            </Link>
            <a href={DEMO_BOOKING_URL} target="_blank" rel="noopener noreferrer" className="hidden min-h-10 items-center rounded-full border border-[#CFC9B7] px-4 text-sm font-semibold transition hover:border-[#1F2A1C] lg:inline-flex">
              Book demo
            </a>
            <Link href="/register" className="inline-flex min-h-10 items-center rounded-full bg-[#1F2A1C] px-4 text-sm font-semibold text-[#FAF9F6] transition hover:bg-[#2D3D29]">
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-expanded={mobileNavOpen}
              aria-controls="landing-mobile-menu"
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              className="grid size-10 place-items-center rounded-full border border-[#CFC9B7] text-[#1F2A1C] transition hover:border-[#1F2A1C] hover:bg-white/55 md:hidden"
            >
              <MenuIcon open={mobileNavOpen} />
            </button>
          </div>
        </div>
        <div
          id="landing-mobile-menu"
          className={`absolute left-0 right-0 top-full border-b border-[#E0DDD0] bg-[#FAF9F6]/95 px-5 pb-5 shadow-[0_18px_45px_-35px_rgba(31,42,28,.75)] backdrop-blur-xl transition md:hidden ${
            mobileNavOpen ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
          }`}
        >
          <nav className="mx-auto grid max-w-7xl gap-1 pt-2" aria-label="Mobile landing navigation">
            {navItems.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-[#2D352C] transition hover:bg-white/70"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="mx-auto mt-3 grid max-w-7xl gap-2 border-t border-[#E0DDD0] pt-3">
            <a href={DEMO_BOOKING_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileNavOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#CFC9B7] px-4 text-sm font-semibold text-[#1F2A1C]">
              Book demo
            </a>
            <Link href="/login" onClick={() => setMobileNavOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#CFC9B7] px-4 text-sm font-semibold text-[#1F2A1C]">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="mx-auto grid max-w-7xl items-end gap-12 px-5 pb-20 pt-20 md:grid-cols-[1.06fr_.94fr] md:px-8 md:pb-24 md:pt-28">
          <div>
            <div className="landing-rise inline-flex items-center gap-2 rounded-full border border-[#E0DDD0] bg-white px-3 py-2 text-sm text-[#2D352C]">
              <span className="relative size-2 rounded-full bg-[var(--accent-strong)] before:absolute before:inset-[-4px] before:rounded-full before:border before:border-[var(--accent-strong)] before:opacity-60 before:content-['']" />
              GLP-1, peptides &amp; wellness — all in one place
            </div>
            <h1 className="landing-rise mt-8 max-w-[13ch] text-[clamp(48px,7vw,96px)] font-semibold leading-[.96] tracking-[-.045em] text-[#1F2A1C] [animation-delay:80ms]">
              GLP-1 care, all in one <span className="font-serif font-normal italic tracking-[-.015em] text-[var(--accent-strong)]">place.</span>
            </h1>
            <p className="landing-rise mt-7 max-w-2xl text-lg leading-8 text-[#2D352C] [animation-delay:160ms]">
              Track weight, meals, GLP-1 protocols, and progress updates. Build a personalized profile, join the community, and talk to a telehealth doctor about GLPs and more peptides.
            </p>
            <div className="landing-rise mt-9 flex flex-col gap-3 sm:flex-row sm:items-center [animation-delay:240ms]">
              <PrimaryLink href="/register">Start free</PrimaryLink>
              <DemoLink />
              <SecondaryLink href="/telehealth">Talk to a provider</SecondaryLink>
              <span className="text-center text-sm text-[#6B7567] sm:text-left">No card required</span>
            </div>
          </div>
          <HeroPreview />
        </section>

        <section className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="overflow-hidden border-y border-[#E0DDD0] py-6">
            <div className="landing-marquee flex w-max items-center gap-14 text-sm font-semibold text-[#2D352C]/70">
              {['Licensed US providers', 'GLP-1 & peptide protocols', 'Weight & meal tracking', 'Community support', 'Telehealth consults', 'Cancel anytime', 'Licensed US providers', 'GLP-1 & peptide protocols', 'Weight & meal tracking', 'Community support', 'Telehealth consults', 'Cancel anytime'].map((item, index) => (
                <span key={`${item}-${index}`}>{item}</span>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="landing-label">01 - What's inside</p>
              <h2 className="mt-5 max-w-xl text-[clamp(34px,4vw,54px)] font-semibold leading-tight tracking-[-.035em]">Everything you need to stay on protocol.</h2>
            </div>
            <p className="max-w-md text-base leading-7 text-[#6B7567] md:justify-self-end">Click through the product surfaces, or let the preview cycle automatically.</p>
          </div>

          <div className="mt-14 grid gap-10 lg:grid-cols-[.9fr_1.1fr]">
            <div className="divide-y divide-[#E0DDD0] border-y border-[#E0DDD0]" role="tablist" aria-label="Juvenex features">
              {features.map((feature, index) => {
                const selected = feature.id === activeFeature;
                return (
                  <button
                    key={feature.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveFeature(feature.id)}
                    className="group relative flex w-full gap-5 py-6 text-left"
                  >
                    <span className={`pt-1 font-mono text-xs tracking-[.14em] ${selected ? 'text-[#1F2A1C]' : 'text-[#6B7567]'}`}>{String(index + 1).padStart(2, '0')}</span>
                    <span className="block">
                      <span className={`block text-2xl font-semibold tracking-[-.02em] ${selected ? 'text-[#1F2A1C]' : 'text-[#2D352C]'}`}>{feature.title}</span>
                      <span className={`mt-2 block max-w-sm text-sm leading-6 text-[#6B7567] transition ${selected ? 'opacity-100' : 'opacity-70'}`}>{feature.desc}</span>
                    </span>
                    {selected && <span className="absolute bottom-[-1px] left-0 h-0.5 bg-[#1F2A1C]" style={{ width: `${((activeIndex + 1) / features.length) * 100}%` }} />}
                  </button>
                );
              })}
            </div>
            <FeaturePanel active={activeFeature} />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid border-y border-[#E0DDD0] md:grid-cols-4">
            {[
              ['5', '', 'Peptide protocol groups to choose from'],
              ['4', 'tiers', 'Membership levels, from starter to total'],
              ['US', '', 'Licensed providers and pharmacies'],
              ['$0', '', 'To join and use the core app'],
            ].map(([value, unit, label], index) => (
              <div key={label} className={`p-7 ${index > 0 ? 'border-t border-[#E0DDD0] md:border-l md:border-t-0' : ''}`}>
                <p className="text-5xl font-semibold tracking-[-.04em]">{value}<span className="ml-1 text-xl font-medium text-[#6B7567]">{unit}</span></p>
                <p className="mt-3 max-w-48 text-sm leading-6 text-[#6B7567]">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="membership" className="mx-auto max-w-7xl px-5 py-24 md:px-8 md:py-32">
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="landing-label">02 - Membership</p>
              <h2 className="mt-5 max-w-xl text-[clamp(34px,4vw,54px)] font-semibold leading-tight tracking-[-.035em]">Choose the protocol tier that fits your goals.</h2>
            </div>
            <p className="max-w-md text-base leading-7 text-[#6B7567] md:justify-self-end">Each tier gives you a personalized app experience, community access, and a path to consult a telehealth doctor about GLPs and peptides.</p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-4">
            {membershipTiers.map((med) => {
              const isActive = activeMedication ? med.name === activeMedication : Boolean(med.featured);
              return (
              <article
                key={med.name}
                onMouseEnter={() => setActiveMedication(med.name)}
                onMouseLeave={() => setActiveMedication(null)}
                onFocus={() => setActiveMedication(med.name)}
                onBlur={() => setActiveMedication(null)}
                className={`flex min-h-[430px] flex-col rounded-[18px] border p-8 transition-all duration-300 ${isActive ? '-translate-y-2 border-[#1F2A1C] bg-[#1F2A1C] text-[#F5F2E8] shadow-[0_24px_55px_-35px_rgba(31,42,28,.65)]' : 'translate-y-0 border-[#E0DDD0] bg-white text-[#1F2A1C] shadow-none'}`}
              >
                <p className={`text-xs uppercase tracking-[.14em] ${isActive ? 'text-[#BFD1BA]' : 'text-[#6B7567]'}`}>{med.label}</p>
                <h3 className="mt-4 text-3xl font-semibold tracking-[-.03em]">{med.name}</h3>
                <p className="mt-4 text-5xl font-semibold tracking-[-.04em]">{med.price}<span className={`ml-2 text-sm font-medium ${isActive ? 'text-[#B5B7AC]' : 'text-[#6B7567]'}`}>/ month</span></p>
                <p className={`mt-5 text-sm leading-6 ${isActive ? 'text-[#D6D8CF]' : 'text-[#6B7567]'}`}>{med.desc}</p>
                <ul className="mt-6 space-y-3 text-sm">
                  {med.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-1 size-3 rounded-full bg-[var(--accent)]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  {isActive ? (
                    <Link href={med.href} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#FAF9F6] px-5 text-sm font-semibold text-[#1F2A1C] transition hover:bg-white">Start consult <ArrowIcon /></Link>
                  ) : (
                    <PrimaryLink href={med.href}>Get started</PrimaryLink>
                  )}
                </div>
              </article>
              );
            })}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="landing-label">03 - How it works</p>
              <h2 className="mt-5 max-w-xl text-[clamp(34px,4vw,54px)] font-semibold leading-tight tracking-[-.035em]">A personalized, community-driven GLP-1 experience.</h2>
            </div>
            <p className="max-w-md text-base leading-7 text-[#6B7567] md:justify-self-end">Sign up, build your profile, track your goals, and post updates into a news feed where members share comments and real results.</p>
          </div>
          <div className="mt-14 grid border-y border-[#E0DDD0] md:grid-cols-4">
            {[
              ['Step 01', 'Sign up.', 'Create your account and get access to the app experience.'],
              ['Step 02', 'Create your personalized profile.', 'Add photos, goals, preferences, and the protocol you want to explore.'],
              ['Step 03', 'Track goals and post updates.', 'Log weight, meals, GLP-1 progress, and share your wins.'],
              ['Step 04', 'See comments and results.', 'Use the news feed to learn from other members and stay accountable.'],
            ].map(([step, title, desc], index) => (
              <div key={step} className={`p-8 ${index > 0 ? 'border-t border-[#E0DDD0] md:border-l md:border-t-0' : ''}`}>
                <p className="landing-label">{step}</p>
                <h3 className="mt-5 text-2xl font-semibold tracking-[-.02em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#6B7567]">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-24">
          <div className="mx-auto max-w-7xl px-5 md:px-8">
            <p className="landing-label">04 - Members</p>
            <h2 className="mt-5 max-w-xl text-[clamp(34px,4vw,54px)] font-semibold leading-tight tracking-[-.035em]">What members are saying.</h2>
          </div>
          <div className="mt-12 overflow-hidden">
            <div className="landing-marquee landing-marquee-slow flex w-max gap-5 px-5">
              {[
                ['Sarah M.', 'Tracking', 'The app made tracking easy enough that I kept doing it past week four.'],
                ['James K.', 'Telehealth', 'The telehealth consult was the first visit that did not feel rushed.'],
                ['Maria L.', 'Meal plans', 'The recipe builder is the part I use most every week.'],
                ['Devon R.', 'Protocols', 'The protocol tracking alone is worth it. I never felt like I was guessing.'],
                ['Priya A.', 'Community', 'The community feed kept me accountable when motivation dipped.'],
                ['Sarah M.', 'Tracking', 'The app made tracking easy enough that I kept doing it past week four.'],
              ].map(([name, result, quote], index) => (
                <article key={`${name}-${index}`} className="w-[330px] shrink-0 rounded-2xl border border-[#E0DDD0] bg-white p-6">
                  <p className="text-sm font-bold text-[var(--accent-strong)]">5/5</p>
                  <blockquote className="mt-4 text-lg leading-7">&quot;{quote}&quot;</blockquote>
                  <div className="mt-6 flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-[var(--accent-strong)] text-sm font-bold text-white">{name.split(' ').map((part) => part[0]).join('')}</span>
                    <div>
                      <p className="text-sm font-bold">{name}</p>
                      <p className="text-xs text-[#6B7567]">Juvenex member</p>
                    </div>
                    <p className="ml-auto text-sm font-bold text-[var(--accent-strong)]">{result}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8 md:pb-32">
          <div className="grid gap-10 rounded-[20px] bg-[#1F2A1C] p-8 text-[#F5F2E8] md:grid-cols-[1.2fr_.8fr] md:p-14">
            <div>
              <h2 className="max-w-xl text-[clamp(34px,4vw,52px)] font-semibold leading-tight tracking-[-.035em]">Start your GLP-1 journey today.</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#C8CABF]">Free to join the app and community. Upgrade when you are ready for meal planning, protocol tracking, and telehealth support for GLPs and peptides.</p>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <DemoLink variant="dark" />
              <Link href="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#F5F2E8]/35 px-6 text-sm font-bold text-[#F5F2E8] transition hover:border-[#F5F2E8]">Join free <ArrowIcon /></Link>
              <Link href="/telehealth" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#F5F2E8]/35 px-6 text-sm font-bold text-[#F5F2E8] transition hover:border-[#F5F2E8]">Talk to a provider</Link>
              <p className="text-center text-xs text-[#AEB2A5]">No card required - cancel anytime</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E0DDD0] px-5 py-12 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#E0DDD0] bg-white shadow-sm">
                <Image src="/juvenex-logo.jpg" alt="" width={56} height={56} className="h-full w-full object-cover object-center" />
              </span>
              <span className="text-lg font-bold">Juvenex</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[#6B7567]">The GLP-1 companion platform built around personalized profiles, community accountability, clinical support, and outcomes that last.</p>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="landing-label">{group.title}</h3>
              <div className="mt-4 space-y-2">
                {group.links.map((link) => (
                  <Link key={link.label} href={link.href} className="block text-sm text-[#2D352C] hover:text-[#1F2A1C]">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-wrap justify-between gap-3 border-t border-[#E0DDD0] pt-6 text-sm text-[#6B7567]">
          <span>© 2026 Juvenex. All rights reserved.</span>
          <span>Not medical advice. Talk to a licensed provider.</span>
        </div>
      </footer>
    </div>
  );
}
