import {
  BoxIcon,
  PeopleIcon,
  PharmacyIcon,
  PhoneIcon,
  RxIcon,
  ShieldIcon,
} from '../icons'

/** Six reassurance items straight under the hero — design lines 122–131. */
const ITEMS = [
  { icon: PhoneIcon, label: 'Doctor Consults', detail: 'Online' },
  { icon: RxIcon, label: 'Prescriptions', detail: 'Nationwide' },
  { icon: BoxIcon, label: 'Discreet Shipping', detail: 'Always' },
  { icon: PeopleIcon, label: 'Trusted by', detail: '100,000+ Members' },
  { icon: PharmacyIcon, label: 'Licensed Pharmacies', detail: '503A & 503B' },
  { icon: ShieldIcon, label: 'HIPAA', detail: 'Compliant' },
]

export function TrustStrip() {
  return (
    <section className="jxl-sec jxl-sec--first" aria-label="Why Juvenex">
      <ul className="jxl-trust" style={{ listStyle: 'none', margin: 0 }}>
        {ITEMS.map(({ icon: Icon, label, detail }) => (
          <li key={label} className="jxl-trust-item">
            <Icon size={21} strokeWidth={1.7} />
            <div>
              <b>{label}</b>
              <span>{detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
