import { useStudentPortalT } from '@/LanguageContext'

type ApplePayButtonProps = {
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}

/** Native-styled Apple Pay button (Safari renders the wallet sheet, not the Wallet app). */
export function ApplePayButton({ disabled = false, busy = false, onClick }: ApplePayButtonProps) {
  const t = useStudentPortalT()
  const isDisabled = disabled || busy

  return (
    <div className="portal-finance-apple-pay">
      <button
        type="button"
        className="portal-finance-apple-pay__button"
        style={{
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
        aria-label={t('applePayPayWith')}
        disabled={isDisabled}
        onClick={onClick}
      >
        <span
          className="portal-finance-apple-pay__apple-button"
          aria-hidden="true"
        />
        {busy ? (
          <span className="portal-finance-apple-pay__busy">{t('processing')}</span>
        ) : null}
      </button>
      <p className="portal-finance-checkout-form__helper portal-finance-apple-pay__note">
        {t('applePaySheetNote')}
      </p>
    </div>
  )
}
