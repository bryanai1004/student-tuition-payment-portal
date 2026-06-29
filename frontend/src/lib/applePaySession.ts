import { fetchApiJson } from '@/lib/api'
import {
  applePayDisplayName,
  applePayMerchantId,
  isApplePayFeatureEnabled,
} from '@/lib/applePayConfig'
import type { AcceptOpaqueData } from '@/lib/authorizeNet'

declare global {
  interface Window {
    ApplePaySession?: typeof ApplePaySession
  }
}

export type ApplePayLineItem = {
  label: string
  amount: string
}

export type ApplePayCheckoutParams = {
  countryCode?: string
  currencyCode?: string
  lineItems: ApplePayLineItem[]
  total: ApplePayLineItem
  /** Required for Authorize.net billTo */
  billingContact?: {
    givenName?: string
    familyName?: string
    postalCode?: string
  }
}

export function canShowApplePayButton(): boolean {
  if (!isApplePayFeatureEnabled()) return false
  if (typeof window === 'undefined') return false
  const APS = window.ApplePaySession
  if (APS == null) return false
  try {
    return APS.canMakePayments()
  } catch {
    return false
  }
}

type ValidateMerchantResponse = {
  merchantSession: unknown
}

async function validateApplePayMerchant(validationUrl: string): Promise<unknown> {
  const data = (await fetchApiJson('/api/payments/apple-pay/validate-merchant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ validationUrl }),
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Invalid Apple Pay merchant validation response.')
  }
  const session = (data as ValidateMerchantResponse).merchantSession
  if (session == null) {
    throw new Error('Apple Pay merchant validation failed.')
  }
  return session
}

function opaqueDataFromApplePayment(payment: ApplePayJS.ApplePayPayment): AcceptOpaqueData {
  const token = payment.token
  const paymentData = token.paymentData as unknown
  const json =
    typeof paymentData === 'string' ? paymentData : JSON.stringify(paymentData)
  const dataValue = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
  )
  return {
    dataDescriptor: 'COMMON.APPLE.INAPP.PAYMENT',
    dataValue,
  }
}

function billingFromApplePayment(payment: ApplePayJS.ApplePayPayment): {
  cardholderName: string
  billingZip: string
} {
  const contact = payment.billingContact
  const given = contact?.givenName?.trim() ?? ''
  const family = contact?.familyName?.trim() ?? ''
  const cardholderName = `${given} ${family}`.trim()
  const billingZip = (contact?.postalCode ?? '').replace(/\D/g, '').slice(0, 10)
  return { cardholderName, billingZip }
}

export type ApplePayPaymentResult = {
  opaqueData: AcceptOpaqueData
  cardholderName: string
  billingZip: string
}

/**
 * Presents the native Apple Pay sheet (Safari). Resolves with Authorize.net-compatible opaqueData.
 */
export function requestApplePayPayment(
  params: ApplePayCheckoutParams,
): Promise<ApplePayPaymentResult> {
  const merchantId = applePayMerchantId()
  if (merchantId === '') {
    return Promise.reject(new Error('Apple Pay is not configured for this site.'))
  }
  const APS = window.ApplePaySession
  if (APS == null || !APS.canMakePayments()) {
    return Promise.reject(new Error('Apple Pay is not available on this device.'))
  }

  const request: ApplePayJS.ApplePayPaymentRequest = {
    countryCode: params.countryCode ?? 'US',
    currencyCode: params.currencyCode ?? 'USD',
    supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
    merchantCapabilities: ['supports3DS'],
    requiredBillingContactFields: ['name', 'postalAddress'],
    lineItems: params.lineItems.map((item) => ({
      label: item.label,
      amount: item.amount,
      type: 'final',
    })),
    total: {
      label: params.total.label,
      amount: params.total.amount,
      type: 'final',
    },
  }

  const session = new APS(3, request)

  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      try {
        session.abort()
      } catch {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    const succeed = (result: ApplePayPaymentResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    session.onvalidatemerchant = (event: ApplePayJS.ApplePayValidateMerchantEvent) => {
      void validateApplePayMerchant(event.validationURL)
        .then((merchantSession) => {
          session.completeMerchantValidation(merchantSession)
        })
        .catch(fail)
    }

    session.onpaymentauthorized = (event: ApplePayJS.ApplePayPaymentAuthorizedEvent) => {
      try {
        const opaque = opaqueDataFromApplePayment(event.payment)
        const billing = billingFromApplePayment(event.payment)
        session.completePayment(APS.STATUS_SUCCESS)
        succeed({ opaqueData: opaque, ...billing })
      } catch (e) {
        session.completePayment(APS.STATUS_FAILURE)
        fail(e)
      }
    }

    session.oncancel = () => {
      if (settled) return
      settled = true
      reject(new Error('Apple Pay was cancelled.'))
    }

    try {
      session.begin()
    } catch (e) {
      fail(e)
    }
  })
}

export { applePayDisplayName }
