/** Demo-only Apple Pay UI — no real charge; enable with VITE_APPLE_PAY_DEMO=true */
export function isApplePayDemoEnabled(): boolean {
  return String(import.meta.env.VITE_APPLE_PAY_DEMO ?? '').trim().toLowerCase() === 'true'
}

export function preferApplePayDemoOnMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 768px)').matches
}
