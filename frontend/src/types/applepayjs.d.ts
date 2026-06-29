/** Minimal Apple Pay JS types for Safari (DOM lib does not include these). */
declare namespace ApplePayJS {
  type ApplePayLineItemType = 'final' | 'pending'

  interface ApplePayLineItem {
    label: string
    amount: string
    type?: ApplePayLineItemType
  }

  interface ApplePayPaymentRequest {
    countryCode: string
    currencyCode: string
    supportedNetworks: string[]
    merchantCapabilities: string[]
    requiredBillingContactFields?: string[]
    lineItems?: ApplePayLineItem[]
    total: ApplePayLineItem
  }

  interface ApplePayValidateMerchantEvent {
    validationURL: string
  }

  interface ApplePayPaymentToken {
    paymentData: unknown
  }

  interface ApplePayPayment {
    token: ApplePayPaymentToken
    billingContact?: ApplePayPaymentContact
  }

  interface ApplePayPaymentContact {
    givenName?: string
    familyName?: string
    postalCode?: string
  }

  interface ApplePayPaymentAuthorizedEvent {
    payment: ApplePayPayment
  }
}

declare class ApplePaySession {
  static readonly STATUS_SUCCESS: number
  static readonly STATUS_FAILURE: number
  static canMakePayments(): boolean
  constructor(version: number, request: ApplePayJS.ApplePayPaymentRequest)
  onvalidatemerchant: ((event: ApplePayJS.ApplePayValidateMerchantEvent) => void) | null
  onpaymentauthorized: ((event: ApplePayJS.ApplePayPaymentAuthorizedEvent) => void) | null
  oncancel: (() => void) | null
  begin(): void
  abort(): void
  completeMerchantValidation(merchantSession: unknown): void
  completePayment(status: number): void
}
