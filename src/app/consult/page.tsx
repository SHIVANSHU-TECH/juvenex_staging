import { redirect } from 'next/navigation'

/**
 * Legacy consult URL. VIP telehealth is native at `/telehealth` (no PrescribeRx).
 */
export default function ConsultPage() {
  redirect('/telehealth')
}
