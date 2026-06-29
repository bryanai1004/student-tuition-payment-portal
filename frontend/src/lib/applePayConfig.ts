/** Apple Pay on the Web (Safari / iOS). Requires merchant ID + domain verification + backend certs. */

export function applePayMerchantId(): string {
  return String(import.meta.env.VITE_APPLE_PAY_MERCHANT_ID ?? '').trim()
}

export function applePayDisplayName(): string {
  const custom = String(import.meta.env.VITE_APPLE_PAY_DISPLAY_NAME ?? '').trim()
  return custom !== '' ? custom : 'Alhambra Medical University'
}

export function isApplePayFeatureEnabled(): boolean {
  const flag = String(import.meta.env.VITE_APPLE_PAY_ENABLED ?? '').trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'no') return false
  return applePayMerchantId() !== ''
}

export function isApplePayDemoEnabled(): boolean {
  return String(import.meta.env.VITE_APPLE_PAY_DEMO ?? '').trim().toLowerCase() === 'true'
}

export function preferApplePayOnMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 768px)').matches
}
