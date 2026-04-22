import { getStudentQuarterBalance } from "./studentLedgerService.js";
import { chargeAuthorizeOpaqueData } from "./authorizeNetGatewayService.js";
import { recordAuthorizeNetPayment } from "../repositories/studentAuthorizePaymentRepository.js";

type OpaqueDataInput = {
  dataDescriptor: string;
  dataValue: string;
};

export type AuthorizeChargeBody = {
  term: string;
  amount: number;
  opaqueData: OpaqueDataInput;
};

export type AuthorizeChargeResult = {
  amount: string;
  providerTransactionId: string;
  invoiceNumber: string;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseTermCode(raw: string): { term: string; year: number; termCode: string } | null {
  const input = raw.trim();
  const coded = /^(\d{4})\s*[-_/]\s*([a-zA-Z]+)$/.exec(input);
  if (coded) {
    const year = Number(coded[1]);
    const code = coded[2].trim().toUpperCase();
    const term =
      code.startsWith("SPR") ? "Spring"
      : code.startsWith("SUM") ? "Summer"
      : code.startsWith("FAL") ? "Fall"
      : code.startsWith("WIN") ? "Winter"
      : "";
    if (term && Number.isFinite(year)) {
      return { term, year: Math.trunc(year), termCode: `${Math.trunc(year)}-${code.slice(0, 3)}` };
    }
  }

  const plain = /^([a-zA-Z]+)\s+(\d{4})$/.exec(input);
  if (plain) {
    const year = Number(plain[2]);
    const token = plain[1].trim().toUpperCase();
    const term =
      token.startsWith("SPR") ? "Spring"
      : token.startsWith("SUM") ? "Summer"
      : token.startsWith("FAL") ? "Fall"
      : token.startsWith("WIN") ? "Winter"
      : "";
    const suffix =
      token.startsWith("SPR") ? "SPR"
      : token.startsWith("SUM") ? "SUM"
      : token.startsWith("FAL") ? "FAL"
      : token.startsWith("WIN") ? "WIN"
      : "";
    if (term && suffix && Number.isFinite(year)) {
      return { term, year: Math.trunc(year), termCode: `${Math.trunc(year)}-${suffix}` };
    }
  }
  return null;
}

function invoiceNumberFor(studentId: string): string {
  const sid = studentId.trim().replace(/[^a-zA-Z0-9]/g, "").slice(-10) || "STD";
  const stamp = Date.now().toString(36).toUpperCase();
  return `MYAMU-${sid}-${stamp}`.slice(0, 20);
}

function referenceIdFor(studentId: string): string {
  const sid = studentId.trim().replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "STD";
  const stamp = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  return `REF-${sid}-${stamp}`.slice(0, 20);
}

export function parseAuthorizeChargeBody(
  raw: unknown,
): { ok: true; value: AuthorizeChargeBody } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const term = typeof o.term === "string" ? o.term.trim() : "";
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number" ? amountRaw
    : typeof amountRaw === "string" ? Number(amountRaw)
    : Number.NaN;
  const opaque = o.opaqueData;
  if (term === "") {
    return { ok: false, error: "term is required." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a number greater than 0." };
  }
  if (opaque == null || typeof opaque !== "object") {
    return { ok: false, error: "opaqueData is required." };
  }
  const descriptor = String((opaque as Record<string, unknown>).dataDescriptor ?? "").trim();
  const value = String((opaque as Record<string, unknown>).dataValue ?? "").trim();
  if (!descriptor || !value) {
    return {
      ok: false,
      error: "opaqueData must include dataDescriptor and dataValue.",
    };
  }
  return {
    ok: true,
    value: {
      term,
      amount: roundMoney(amount),
      opaqueData: {
        dataDescriptor: descriptor,
        dataValue: value,
      },
    },
  };
}

export async function processAuthorizeNetStudentPayment(input: {
  studentId: string;
  termInput: string;
  amount: number;
  opaqueData: OpaqueDataInput;
}): Promise<AuthorizeChargeResult> {
  const parsedTerm = parseTermCode(input.termInput);
  if (!parsedTerm) {
    throw new Error("term must be in `YYYY-TERM` format (example: 2027-SPR).");
  }
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }
  const balance = roundMoney(
    await getStudentQuarterBalance(input.studentId, parsedTerm.term, parsedTerm.year),
  );
  if (amount > balance) {
    throw new Error("Payment amount cannot exceed outstanding balance.");
  }
  const invoiceNumber = invoiceNumberFor(input.studentId);
  const referenceId = referenceIdFor(input.studentId);
  const charged = await chargeAuthorizeOpaqueData({
    amount,
    opaqueData: input.opaqueData,
    invoiceNumber,
    referenceId,
    studentId: input.studentId,
    termCode: parsedTerm.termCode,
  });

  await recordAuthorizeNetPayment({
    studentId: input.studentId,
    term: parsedTerm.term,
    year: parsedTerm.year,
    amount,
    paidAt: new Date().toISOString().slice(0, 10),
    method: "authorize_net",
    description: `Authorize.net payment ${charged.transactionId}`.slice(0, 255),
    providerTransactionId: charged.transactionId,
    invoiceNumber,
    status: "succeeded",
  });

  return {
    amount: amount.toFixed(2),
    providerTransactionId: charged.transactionId,
    invoiceNumber,
  };
}
