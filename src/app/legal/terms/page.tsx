import Link from 'next/link'

export const metadata = {
  title: 'Membership Agreement | Juvenex',
  description:
    'Terms of Service and Privacy Policy acknowledgement for Juvenex membership access.',
}

const acknowledgements = [
  'This membership grants access to a platform, resources, and the ability to connect with independent third-party providers.',
  'We are not selling you a doctor consultation.',
  'We are not selling you peptides, prescription medication, or any pharmaceutical product.',
  'We are not selling you any specific treatment, protocol, or medical service.',
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#E5EAE3] bg-white p-8 shadow-sm prose prose-sm prose-headings:text-[#2D352C] prose-p:text-[#2D352C]/80 prose-li:text-[#2D352C]/80">
        <h1 className="text-2xl font-bold text-[#2D352C]">
          Membership Agreement - Terms of Service &amp; Privacy Policy
        </h1>
        <p className="text-xs text-[#2D352C]/60">Last updated: 2026-06-10</p>

        <p className="font-semibold text-[#2D352C]">
          Please review and acknowledge the following. By purchasing a
          membership and clicking &quot;I agree&quot;, you confirm that you have
          read, understood, and agree to be legally bound by these Terms of
          Service and Privacy Policy.
        </p>

        <h2>1. What You Are Purchasing</h2>
        <p>
          You are purchasing a <strong>membership that provides access only</strong>.
        </p>
        <p>You expressly understand and acknowledge that:</p>
        <ul>
          {acknowledgements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>
          Your membership fee is paid solely for access and the ability to make
          your own informed choice about whether to pursue available protocols,
          consultations, or products through independent licensed providers and
          third parties.
        </p>

        <h2>2. No Medical Services Provided by Us</h2>
        <p>You understand and agree that:</p>
        <ul>
          <li>
            We are not a healthcare provider, medical practice, pharmacy, or
            compounding facility.
          </li>
          <li>
            We do not practice medicine, provide medical advice, diagnose
            conditions, or prescribe medication.
          </li>
          <li>
            Any consultation, prescription, treatment, or product you may obtain
            is provided by independent, licensed third-party providers who are
            solely responsible for their own services.
          </li>
          <li>
            The decision to pursue any consultation, protocol, peptide, or
            medication is entirely your own choice and at your own discretion
            and risk.
          </li>
          <li>
            Nothing in your membership guarantees that you will qualify for, be
            approved for, or receive any consultation, prescription, product, or
            protocol.
          </li>
        </ul>

        <h2>3. Role of the Platform</h2>
        <p>We act only as a facilitator of access. We:</p>
        <ul>
          <li>Provide a membership platform and informational resources.</li>
          <li>
            Give you the ability to choose to connect with third-party licensed
            providers.
          </li>
          <li>
            Do not control, direct, or influence the independent medical
            judgment of any provider.
          </li>
          <li>
            Are not responsible for the acts, omissions, services, products, or
            outcomes of any third-party provider, pharmacy, or supplier.
          </li>
        </ul>
        <p>
          Any relationship you form with a provider is directly between you and
          that provider.
        </p>

        <h2>4. No Guarantee of Results</h2>
        <p>You acknowledge that:</p>
        <ul>
          <li>
            No specific health, medical, cosmetic, or performance outcome is
            promised or guaranteed.
          </li>
          <li>Individual results vary, and any protocol carries inherent risks.</li>
          <li>
            You are responsible for consulting with a qualified, licensed
            healthcare professional before beginning any protocol, treatment, or
            medication.
          </li>
        </ul>

        <h2>5. Assumption of Risk &amp; Release of Liability</h2>
        <p>By purchasing a membership, you knowingly and voluntarily:</p>
        <ul>
          <li>
            Assume all risks associated with any decision to pursue
            consultations, protocols, peptides, or medications.
          </li>
          <li>
            Release, waive, and discharge us, our owners, officers, employees,
            and affiliates from any and all liability, claims, demands, or
            damages arising from your use of the membership or any decision you
            make through it.
          </li>
          <li>
            Agree that you are making independent, informed choices as an adult
            capable of doing so.
          </li>
        </ul>

        <h2>6. Eligibility</h2>
        <p>You confirm that:</p>
        <ul>
          <li>
            You are at least 18 years of age, or the age of majority in your
            jurisdiction.
          </li>
          <li>You are legally permitted to enter into this agreement.</li>
          <li>The information you provide is accurate and truthful.</li>
        </ul>

        <h2>7. Membership, Billing &amp; Cancellation</h2>
        <ul>
          <li>Membership fees are charged for access, as described above.</li>
          <li>
            Billing terms, renewal periods, and pricing are presented at
            checkout.
          </li>
          <li>
            Membership fees are non-refundable except as required by law or your
            specific terms.
          </li>
          <li>
            You may cancel your membership at any time. Cancellation stops
            future billing but does not entitle you to a refund of fees already
            paid unless otherwise stated.
          </li>
        </ul>

        <h2>8. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Misuse, resell, or share your membership access.</li>
          <li>Provide false information.</li>
          <li>Use the platform for any unlawful purpose.</li>
        </ul>
        <p>
          We reserve the right to suspend or terminate any membership that
          violates these terms.
        </p>

        <h2>9. Intellectual Property</h2>
        <p>
          All content, materials, branding, and resources provided through the
          membership are owned by us or our licensors and may not be copied,
          distributed, or reused without permission.
        </p>

        <h2>10. Disclaimers</h2>
        <p>
          The membership and all content are provided &quot;as is&quot; and
          &quot;as available&quot; without warranties of any kind, express or
          implied, including but not limited to merchantability, fitness for a
          particular purpose, and non-infringement.
        </p>

        <h2>11. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, our total liability for any
          claim arising out of or relating to this agreement shall not exceed
          the amount you paid for your membership in the prior 3 months. We
          shall not be liable for any indirect, incidental, consequential, or
          punitive damages.
        </p>

        <h2>12. Indemnification</h2>
        <p>
          You agree to indemnify and hold us harmless from any claims, losses,
          or expenses, including attorney&apos;s fees, arising from your use of
          the membership, your decisions, or your violation of these terms.
        </p>

        <h2>13. Dispute Resolution &amp; Governing Law</h2>
        <p>This agreement is governed by the laws of Florida, USA.</p>

        <h2>14. Changes to Terms</h2>
        <p>
          We may update these terms at any time. Continued use of your
          membership after changes constitutes acceptance of the updated terms.
        </p>

        <h2>15. Contact</h2>
        <p>
          Questions about these terms? Email{' '}
          <a href="mailto:support@juvenex.app">support@juvenex.app</a>.
        </p>

        <p className="mt-8 text-xs text-[#2D352C]/60">
          See also our{' '}
          <Link href="/legal/privacy" className="underline text-[var(--accent-strong)]">
            Privacy Policy
          </Link>
          .
        </p>
      </article>
    </main>
  )
}
