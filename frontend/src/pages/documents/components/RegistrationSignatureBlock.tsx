export function RegistrationSignatureBlock() {
  return (
    <div className="portal-registration-form-signatures">
      <div className="portal-registration-form-signatures__row">
        <span>Student Signature</span>
        <span className="portal-registration-form-signatures__line" aria-hidden="true" />
        <span>Date</span>
        <span className="portal-registration-form-signatures__line portal-registration-form-signatures__line--short" aria-hidden="true" />
      </div>
      <div className="portal-registration-form-signatures__row">
        <span>Clinic Director Signature</span>
        <span className="portal-registration-form-signatures__line" aria-hidden="true" />
        <span>Date</span>
        <span className="portal-registration-form-signatures__line portal-registration-form-signatures__line--short" aria-hidden="true" />
      </div>
      <div className="portal-registration-form-signatures__row">
        <span>Registrar Signature</span>
        <span className="portal-registration-form-signatures__line" aria-hidden="true" />
        <span>Date</span>
        <span className="portal-registration-form-signatures__line portal-registration-form-signatures__line--short" aria-hidden="true" />
      </div>
    </div>
  )
}
