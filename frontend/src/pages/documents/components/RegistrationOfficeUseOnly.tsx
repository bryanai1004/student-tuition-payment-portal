import type { RegistrationOfficeFees } from '../../../lib/registrationFormAdapter'

type Props = {
  fees: RegistrationOfficeFees
}

function money(n: number): string {
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

export function RegistrationOfficeUseOnly({ fees }: Props) {
  return (
    <section className="portal-registration-form-office" aria-label="Office use only">
      <h3 className="portal-registration-form-office__title">Office Use Only</h3>
      <div className="portal-registration-form-office__grid">
        <div className="portal-registration-form-office__col">
          <p className="portal-registration-form-office__label">FEES</p>
          <ul className="portal-registration-form-office__list">
            <li>
              <span>TUITION</span>
              <span>{money(fees.tuition)}</span>
            </li>
            <li>
              <span>Clinic Insurances</span>
              <span>{money(0)}</span>
            </li>
            <li>
              <span>Others</span>
              <span>{money(fees.other)}</span>
            </li>
            <li>
              <span>Application Fee</span>
              <span>{money(fees.applicationFee)}</span>
            </li>
            <li>
              <span>Discount</span>
              <span>{money(fees.discount)}</span>
            </li>
          </ul>
        </div>
        <div className="portal-registration-form-office__col">
          <p className="portal-registration-form-office__label">&nbsp;</p>
          <ul className="portal-registration-form-office__list">
            <li>
              <span>Registration</span>
              <span>{money(fees.registration)}</span>
            </li>
            <li>
              <span>Clinic</span>
              <span>{money(fees.clinic)}</span>
            </li>
            <li>
              <span>Total Fees</span>
              <span>{money(fees.totalFees)}</span>
            </li>
          </ul>
        </div>
        <div className="portal-registration-form-office__col">
          <p className="portal-registration-form-office__label">Payment</p>
          <ul className="portal-registration-form-office__list">
            <li>
              <span>Payment received</span>
              <span>{money(0)}</span>
            </li>
            <li>
              <span>Date</span>
              <span>—</span>
            </li>
            <li>
              <span>Receipt #</span>
              <span>—</span>
            </li>
            <li>
              <span>Handled by</span>
              <span>—</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
