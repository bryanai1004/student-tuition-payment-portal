export function PortalStudentInfoBar() {
  return (
    <section
      className="portal-student-info-bar"
      aria-label="Signed-in student"
    >
      <div className="portal-student-info-bar-inner">
        <div className="portal-student-info-bar-identity">
          <div
            className="portal-student-info-bar-avatar"
            aria-hidden="true"
          >
            BL
          </div>
          <div className="portal-student-info-bar-text">
            <p className="portal-student-info-bar-name">Bingchen Li</p>
          </div>
        </div>
        <div className="portal-student-info-bar-balance">
          <span className="portal-student-info-bar-balance-label">
            Balance
          </span>
          <span className="portal-student-info-bar-balance-amount">
            $18,400
          </span>
        </div>
      </div>
    </section>
  )
}
