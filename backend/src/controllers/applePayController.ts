import type { Request, Response } from "express";
import { validateApplePayMerchantSession } from "../services/applePayMerchantValidationService.js";

/**
 * POST /api/payments/apple-pay/validate-merchant
 * Body: { validationUrl: string }
 *
 * Called from ApplePaySession.onvalidatemerchant (Safari). Requires Apple merchant cert secrets.
 */
export async function postApplePayValidateMerchantHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown> | null | undefined;
    const validationUrl =
      typeof body?.validationUrl === "string" ? body.validationUrl.trim() : "";
    if (validationUrl === "") {
      res.status(400).json({ error: "validationUrl is required." });
      return;
    }
    const merchantSession = await validateApplePayMerchantSession(validationUrl);
    res.status(200).json({ merchantSession });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[payments/apple-pay/validate-merchant]", message);
    const isConfig = /not configured/i.test(message);
    res.status(isConfig ? 503 : 502).json({ error: message });
  }
}
