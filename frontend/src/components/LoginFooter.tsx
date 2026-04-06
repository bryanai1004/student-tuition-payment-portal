/**
 * Shared footer for student and administrator login screens.
 * Uses AMU portal tokens from global styles (portal.css).
 */
export function LoginFooter() {
  return (
    <footer className="portal-login-footer" role="contentinfo">
      <div className="portal-login-footer__inner">
        <p className="portal-login-footer__powered">Powered by WanPanel AI</p>
        <div className="portal-login-footer__accent" aria-hidden="true" />
        <p className="portal-login-footer__copyright">
          © 2026 Alhambra Medical University. All rights reserved.
        </p>
        <p className="portal-login-footer__detail">
          2215 W Mission Rd Suite 280, Alhambra, CA 91803
        </p>
        <p className="portal-login-footer__detail">
          <a className="portal-login-footer__tel" href="tel:+16264388980">
            <svg
              className="portal-login-footer__tel-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden={true}
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span>+1 (626) 438-8980</span>
          </a>
        </p>
      </div>
    </footer>
  )
}
