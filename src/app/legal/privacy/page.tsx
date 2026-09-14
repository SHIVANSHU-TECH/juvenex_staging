import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy | Juvenex',
  description: 'How Juvenex collects, uses, shares, and protects membership platform information.',
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#E5EAE3] bg-white p-8 shadow-sm prose prose-sm prose-headings:text-[#2D352C] prose-p:text-[#2D352C]/80 prose-li:text-[#2D352C]/80">
        <h1 className="text-2xl font-bold text-[#2D352C]">Privacy Policy</h1>
        <p className="text-xs text-[#2D352C]/60">Last updated: 2026-06-10</p>

        <h2>A. Information We Collect</h2>
        <p>We may collect:</p>
        <ul>
          <li>
            <strong>Identifying information:</strong> name, email, phone, and
            billing address.
          </li>
          <li>
            <strong>Payment information:</strong> processed securely through our
            payment processor. We do not store full card numbers.
          </li>
          <li>
            <strong>Account information:</strong> login credentials and
            membership status.
          </li>
          <li>
            <strong>Usage data:</strong> IP address, device, browser, and
            platform activity.
          </li>
          <li>
            <strong>Health &amp; wellness data you enter:</strong> weight and
            progress entries, progress photos, food and meal logs, wellness
            goals, and health pre-screening quiz responses.
          </li>
          <li>
            <strong>AI assistant conversations:</strong> messages you send to
            the in-app assistant, which are processed by a third-party AI
            provider to generate responses.
          </li>
          <li>
            Information you choose to provide when connecting with third-party
            providers.
          </li>
        </ul>

        <h2>B. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide and manage your membership access.</li>
          <li>Process payments and billing.</li>
          <li>
            Facilitate your chosen connection to third-party providers.
          </li>
          <li>Communicate with you about your account.</li>
          <li>Improve our platform and comply with legal obligations.</li>
        </ul>

        <h2>C. Health &amp; Sensitive Information</h2>
        <p>
          We are not a covered entity or healthcare provider and do not provide
          medical services.
        </p>
        <p>
          Medical intake information you submit through an embedded third-party
          provider (for a consultation or prescription) is transmitted to and
          governed by that provider&apos;s privacy practices and applicable
          laws, including HIPAA where applicable.
        </p>
        <p>
          Separately, wellness and tracking information you enter into Juvenex
          itself — such as weight and progress entries, progress photos, food
          and meal logs, goals, and health quiz responses — is stored by Juvenex
          to provide the app&apos;s tracking, meal-planning, and personalization
          features. You can permanently delete this data at any time by deleting
          your account in Settings.
        </p>

        <h2>D. How We Share Information</h2>
        <p>We may share information with:</p>
        <ul>
          <li>Third-party providers you choose to connect with.</li>
          <li>
            Service providers, including payment processors, hosting, and
            analytics providers, under confidentiality obligations.
          </li>
          <li>Legal authorities when required by law.</li>
        </ul>

        <h3>Sale of Personal Information</h3>
        <p>
          <strong>We do not sell your personal information.</strong>
        </p>
        <p>
          Juvenex.app does not sell, rent, or exchange your personal
          information, including your name, contact details, payment
          information, membership preferences, health or wellness data, or any
          other information collected through the app, to third parties for
          monetary or other valuable consideration. This commitment applies
          especially to data provided when you purchase or maintain a
          membership.
        </p>
        <p>
          We may share your personal information only in extremely limited
          circumstances, none of which constitute a &quot;sale&quot; under
          applicable U.S. privacy laws, including the California Consumer
          Privacy Act (CCPA), as amended by the California Privacy Rights Act
          (CPRA), and similar laws in other states:
        </p>
        <ul>
          <li>
            <strong>With service providers and vendors:</strong> We work with a
            limited number of trusted third-party vendors who assist with
            operating the app, processing payments, delivering membership
            benefits, or providing customer support. Any sharing with these
            vendors is strictly limited to what is necessary for them to perform
            services on our behalf. These vendors are contractually obligated to
            protect your data and use it only for the purposes we authorize, not
            for their own marketing or other purposes.
          </li>
          <li>
            <strong>Third-party integrations chosen by you:</strong> If you
            choose to do business with or connect to a third-party vendor or
            service available through or linked from the Juvenex app, for
            example a wellness partner, payment provider, or other integration,
            you may need to provide your own information directly to that third
            party. In such cases, Juvenex.app will share only the minimal data
            required to enable the connection or transaction you requested. We
            do not share extensive personal information with these vendors.
          </li>
          <li>
            <strong>For business purposes:</strong> Such as fraud prevention,
            security, legal compliance, or in the context of a merger or
            acquisition, with continued data protections.
          </li>
          <li>
            <strong>With your explicit consent:</strong> When you direct us to
            share specific information.
          </li>
          <li>
            <strong>As required by law:</strong> In response to valid legal
            requests or to protect rights and safety.
          </li>
        </ul>
        <p>
          <strong>No financial incentives tied to data sales:</strong> We do
          not offer any discounts, payments, or incentives in exchange for the
          right to sell your personal information.
        </p>
        <p>
          If our data practices ever change in the future, we will update this
          Privacy Policy and provide appropriate notice and any required opt-out
          options under applicable law.
        </p>

        <h3>Your Privacy Rights (U.S. Residents)</h3>
        <p>
          Residents of states with privacy laws, such as California, Virginia,
          Colorado, and others, may have rights to access, delete, correct, or
          obtain information about their personal data. Because we do not sell
          personal information, no &quot;Do Not Sell or Share My Personal
          Information&quot; opt-out is currently required. To exercise your
          rights or ask questions, contact us at{' '}
          <a href="mailto:privacy@juvenex.app">privacy@juvenex.app</a>.
        </p>
        <p>
          This section is part of our full Privacy Policy. Please review the
          entire policy for complete details on data collection, use, sharing,
          and protection related to your Juvenex membership.
        </p>

        <h2>E. Data Security</h2>
        <p>
          We use reasonable administrative, technical, and physical safeguards
          to protect your information. However, no system is 100% secure, and
          we cannot guarantee absolute security.
        </p>

        <h2>F. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul>
          <li>Access, correct, or delete your personal information.</li>
          <li>Opt out of certain data uses or marketing.</li>
          <li>Request information about data we hold.</li>
        </ul>
        <p>
          To exercise these rights, contact us at{' '}
          <a href="mailto:privacy@juvenex.app">privacy@juvenex.app</a>.
        </p>

        <h2>G. Cookies &amp; Tracking</h2>
        <p>
          We use cookies and similar technologies. You can manage preferences
          through your browser settings.
        </p>

        <h2>H. Data Retention</h2>
        <p>
          We retain your information for as long as necessary to provide
          services and comply with legal obligations.
        </p>

        <h2>I. Children&apos;s Privacy</h2>
        <p>
          Our membership is not intended for individuals under 18, and we do
          not knowingly collect their data.
        </p>

        <h2>J. Contact Us</h2>
        <p>
          For privacy questions, contact:{' '}
          <a href="mailto:privacy@juvenex.app">privacy@juvenex.app</a>.
        </p>

        <p className="mt-8 text-xs text-[#2D352C]/60">
          See also our{' '}
          <Link href="/legal/terms" className="underline text-[var(--accent-strong)]">
            Membership Agreement and Terms of Service
          </Link>
          .
        </p>
      </article>
    </main>
  )
}
