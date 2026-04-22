import type { Request, Response } from "express";
import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";
import {
  parseAuthorizeChargeBody,
  processAuthorizeNetStudentPayment,
} from "../services/studentAuthorizePaymentService.js";

export async function postAuthorizeNetChargeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const authStudent = verifyStudentAccessToken(req.headers.authorization);
  if (!authStudent) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const parsed = parseAuthorizeChargeBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const result = await processAuthorizeNetStudentPayment({
      studentId: authStudent.studentId,
      termInput: parsed.value.term,
      amount: parsed.value.amount,
      opaqueData: parsed.value.opaqueData,
    });
    res.json({
      ok: true,
      amount: result.amount,
      providerTransactionId: result.providerTransactionId,
      invoiceNumber: result.invoiceNumber,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process payment.";
    if (
      /amount|term|balance|required|format|Authentication|configured/i.test(
        message,
      )
    ) {
      res.status(400).json({ error: message });
      return;
    }
    console.error("[payments/authorize/charge]", error);
    res.status(502).json({ error: "Payment could not be processed." });
  }
}
