import type { RegistrationFormViewModel } from '../../../lib/registrationFormAdapter'
import { RegistrationClinicTable } from './RegistrationClinicTable'
import { RegistrationDidacticTable } from './RegistrationDidacticTable'
import { RegistrationOfficeUseOnly } from './RegistrationOfficeUseOnly'
import { RegistrationSignatureBlock } from './RegistrationSignatureBlock'

type Props = {
  model: RegistrationFormViewModel
}

export function RegistrationFormPreview({ model }: Props) {
  const { student } = model

  return (
    <article className="portal-registration-form-sheet" aria-label="Registration form preview">
      <header className="portal-registration-form-sheet__masthead">
        <p className="portal-registration-form-sheet__school">Alhambra Medical University</p>
        <p className="portal-registration-form-sheet__office">
          Office of Admission: 25 South Raymond Ave., Suite 201, Alhambra, CA 91801
        </p>
        <p className="portal-registration-form-sheet__contact">
          Tel: 626-289-7719 &nbsp; Fax: 626-289-8641
        </p>
      </header>

      <h2 className="portal-registration-form-sheet__doc-title">Registration Form</h2>

      <div className="portal-registration-form-sheet__student-grid">
        <dl className="portal-registration-form-sheet__dl">
          <div>
            <dt>Name</dt>
            <dd>{student.name}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{student.address}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{student.email}</dd>
          </div>
          <div>
            <dt>Registration Quarter</dt>
            <dd>{student.registrationQuarter}</dd>
          </div>
        </dl>
        <dl className="portal-registration-form-sheet__dl">
          <div>
            <dt>Student ID</dt>
            <dd>{student.studentId}</dd>
          </div>
          <div>
            <dt>Contact Phone</dt>
            <dd>{student.contactPhone}</dd>
          </div>
        </dl>
      </div>

      <section className="portal-registration-form-sheet__section" aria-label="Didactic courses">
        <RegistrationDidacticTable rows={model.didactic} totalUnits={model.totalUnits} />
      </section>

      <section className="portal-registration-form-sheet__section" aria-label="Clinic courses">
        <RegistrationClinicTable rows={model.clinic} totalHours={model.totalHours} />
      </section>

      <div className="portal-registration-form-sheet__confirm">
        <p>
          I have checked and confirmed that the above courses registered are correct. I understand
          that I am responsible for the payment of the tuition and fees for those classes, regardless
          my attendance. I also understand that the credits will not be granted if I attend any class
          other than the courses registered above.
        </p>
        <p lang="zh-Hant">
          我核對過而且確認上述註冊的課程是正確的。我明白即使我沒去上課，我也必須支付這些課程的學費。我也明白，如果我去上了上述註冊的課程以外的課程，學分將不會被承認。
        </p>
        <label className="portal-registration-form-sheet__check">
          <input type="checkbox" disabled />
          <span>check the box here</span>
        </label>
        <label className="portal-registration-form-sheet__check">
          <input type="checkbox" disabled />
          <span>check the box here</span>
        </label>
      </div>

      <RegistrationSignatureBlock />

      <RegistrationOfficeUseOnly fees={model.office} />

      <div className="portal-registration-form-sheet__print-actions portal-academics-print-hide">
        <button
          type="button"
          className="portal-btn portal-btn--secondary"
          onClick={() => window.print()}
        >
          Print Registration Form
        </button>
      </div>
    </article>
  )
}
