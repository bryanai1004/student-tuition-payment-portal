import { pool } from "../lib/db.js";
import { getStoreFeeSku, listStoreFeeCatalog } from "../config/storeFeeCatalog.js";
import type { PortalBillingCategory } from "../repositories/adminFinanceRepository.js";
import { insertPortalBillingAdjustment } from "../repositories/adminFinanceRepository.js";
import {
  insertStoreOrder,
  insertStoreOrderItem,
  markStoreOrderPaid,
  portalStoreTablesExist,
} from "../repositories/studentStoreRepository.js";
import { chargeAuthorizeOpaqueData } from "./authorizeNetGatewayService.js";
import {
  inferCardFundingFromBinPrefix,
  normalizeCardBinPrefix,
} from "./cardFundingFromBin.js";
import { totalChargeWithProcessingFee } from "./creditCardProcessingFee.js";
import {
  parsePaymentBillingDetails,
  splitCardholderNameForBillTo,
} from "./paymentBillingFields.js";

type OpaqueDataInput = {
  dataDescriptor: string;
  dataValue: string;
};

export type StoreCartLineInput = {
  feeCode: string;
  quantity: number;
  notes?: string | null;
};

export type StoreCheckoutBody = {
  term: string;
  year: number;
  items: StoreCartLineInput[];
  opaqueData: OpaqueDataInput;
  cardBinPrefix: string;
  cardholderName: string;
  billingZip: string;
};

export type StoreCheckoutResult = {
  orderId: number;
  amount: string;
  baseAmount: string;
  processingFee: string;
  cardFunding: "credit" | "debit" | "unknown";
  providerTransactionId: string;
  invoiceNumber: string;
  adjustmentIds: number[];
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolveTermFromBody(
  termRaw: string,
  year: number,
): { term: string; year: number } | null {
  const fromCode = parseTermParts(termRaw);
  if (fromCode) return fromCode;
  const t = termRaw.trim();
  if (t === "" || !Number.isFinite(year)) return null;
  const upper = t.toUpperCase();
  const normalized =
    upper.startsWith("SPR") ? "Spring"
    : upper.startsWith("SUM") ? "Summer"
    : upper.startsWith("FAL") ? "Fall"
    : upper.startsWith("WIN") ? "Winter"
    : t.slice(0, 1).toUpperCase() + t.slice(1).toLowerCase();
  return { term: normalized, year: Math.trunc(year) };
}

function parseTermParts(raw: string): { term: string; year: number } | null {
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
      return { term, year: Math.trunc(year) };
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
    if (term && Number.isFinite(year)) {
      return { term, year: Math.trunc(year) };
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

function termCodeFromParts(term: string, year: number): string {
  const upper = term.trim().toUpperCase();
  const suffix =
    upper.startsWith("SPR") ? "SPR"
    : upper.startsWith("SUM") ? "SUM"
    : upper.startsWith("FAL") ? "FAL"
    : upper.startsWith("WIN") ? "WIN"
    : upper.slice(0, 3) || "TRM";
  return `${Math.trunc(year)}-${suffix}`;
}

export function getStoreCatalogPayload(locale: "en" | "zh" = "en") {
  return {
    items: listStoreFeeCatalog().map((sku) => ({
      code: sku.code,
      name: locale === "zh" ? sku.nameZh : sku.nameEn,
      description: locale === "zh" ? sku.descriptionZh : sku.descriptionEn,
      unitPriceUsd: sku.unitPriceUsd,
      allowQuantity: sku.allowQuantity,
      maxQuantity: sku.maxQuantity,
      catalogRef: sku.catalogRef,
    })),
  };
}

type ResolvedCartLine = {
  feeCode: string;
  description: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  category: PortalBillingCategory;
  notes: string | null;
};

function resolveCartLines(items: StoreCartLineInput[]): ResolvedCartLine[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart must include at least one item.");
  }
  const lines: ResolvedCartLine[] = [];
  for (const raw of items) {
    const feeCode = String(raw.feeCode ?? "").trim();
    const sku = getStoreFeeSku(feeCode);
    if (!sku) {
      throw new Error(`Unknown fee code: ${feeCode || "(empty)"}`);
    }
    const qtyRaw = Math.trunc(Number(raw.quantity));
    const quantity =
      sku.allowQuantity ? Math.max(1, Math.min(qtyRaw || 1, sku.maxQuantity)) : 1;
    const unitPrice = roundMoney(sku.unitPriceUsd);
    const lineTotal = roundMoney(unitPrice * quantity);
    const notes =
      raw.notes != null && String(raw.notes).trim() !== ""
        ? String(raw.notes).trim().slice(0, 500)
        : null;
    lines.push({
      feeCode: sku.code,
      description: `Store: ${sku.nameEn}${quantity > 1 ? ` (×${quantity})` : ""}`,
      unitPrice,
      quantity,
      lineTotal,
      category: sku.category,
      notes,
    });
  }
  return lines;
}

export function parseStoreCheckoutBody(
  raw: unknown,
): { ok: true; value: StoreCheckoutBody } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const termRaw = o.term;
  const yearRaw = o.year;
  const term =
    typeof termRaw === "string" ? termRaw.trim()
    : typeof termRaw === "number" ? String(termRaw)
    : "";
  const year =
    typeof yearRaw === "number" ? Math.trunc(yearRaw)
    : typeof yearRaw === "string" ? Math.trunc(Number(yearRaw))
    : Number.NaN;
  if (term === "" || !Number.isFinite(year)) {
    return { ok: false, error: "term and year are required." };
  }
  if (!Array.isArray(o.items) || o.items.length === 0) {
    return { ok: false, error: "items must be a non-empty array." };
  }
  const items: StoreCartLineInput[] = [];
  for (const row of o.items) {
    if (row == null || typeof row !== "object") {
      return { ok: false, error: "Each cart item must be an object." };
    }
    const r = row as Record<string, unknown>;
    items.push({
      feeCode: String(r.feeCode ?? "").trim(),
      quantity: Math.trunc(Number(r.quantity) || 1),
      notes: r.notes != null ? String(r.notes) : null,
    });
  }
  const opaque = o.opaqueData;
  if (opaque == null || typeof opaque !== "object") {
    return { ok: false, error: "opaqueData is required." };
  }
  const descriptor = String(
    (opaque as Record<string, unknown>).dataDescriptor ?? "",
  ).trim();
  const value = String((opaque as Record<string, unknown>).dataValue ?? "").trim();
  if (!descriptor || !value) {
    return {
      ok: false,
      error: "opaqueData must include dataDescriptor and dataValue.",
    };
  }
  const bin = normalizeCardBinPrefix(o.cardBinPrefix ?? o.cardBinSix);
  if (bin == null) {
    return {
      ok: false,
      error: "cardBinPrefix must be the first 6–8 digits of the card number.",
    };
  }
  const cardBinPrefix = bin;
  const billing = parsePaymentBillingDetails(o);
  if (!billing.ok) return billing;
  return {
    ok: true,
    value: {
      term,
      year,
      items,
      opaqueData: { dataDescriptor: descriptor, dataValue: value },
      cardBinPrefix,
      cardholderName: billing.value.cardholderName,
      billingZip: billing.value.billingZip,
    },
  };
}

export async function processStoreCheckout(input: {
  studentId: string;
  body: StoreCheckoutBody;
}): Promise<StoreCheckoutResult> {
  if (!(await portalStoreTablesExist(pool))) {
    throw new Error(
      "Fee store is not available yet. Run `supabase db push` from the repo root (migration 20260629233852_portal_store_orders.sql).",
    );
  }
  const parsedTerm = resolveTermFromBody(input.body.term, input.body.year);
  if (!parsedTerm) {
    throw new Error("term and year must identify a valid quarter.");
  }
  const lines = resolveCartLines(input.body.items);
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));
  if (subtotal <= 0) {
    throw new Error("Cart total must be greater than 0.");
  }

  const conn = await pool.getConnection();
  let orderId = 0;
  const adjustmentIds: number[] = [];

  const cardFunding = inferCardFundingFromBinPrefix(input.body.cardBinPrefix);
  const { base, fee, total } = totalChargeWithProcessingFee(subtotal, cardFunding);
  const invoiceNumber = invoiceNumberFor(input.studentId);
  const referenceId = referenceIdFor(input.studentId);
  const billToNames = splitCardholderNameForBillTo(input.body.cardholderName);
  const termCode = termCodeFromParts(parsedTerm.term, parsedTerm.year);

  let charged: { transactionId: string };
  try {
    charged = await chargeAuthorizeOpaqueData({
      amount: total,
      opaqueData: input.body.opaqueData,
      invoiceNumber,
      referenceId,
      studentId: input.studentId,
      termCode,
      billTo: {
        firstName: billToNames.firstName,
        lastName: billToNames.lastName,
        zip: input.body.billingZip,
      },
    });
  } catch (chargeError) {
    throw chargeError;
  }

  const feePart =
    fee > 0
      ? ` card fee ${fee.toFixed(2)} total charged ${total.toFixed(2)}`
      : ` total charged ${total.toFixed(2)}`;

  try {
    await conn.beginTransaction();
    orderId = await insertStoreOrder(conn, {
      studentExternalId: input.studentId,
      term: parsedTerm.term,
      year: parsedTerm.year,
      subtotal: base,
      status: "pending",
    });

    for (const line of lines) {
      const adjId = await insertPortalBillingAdjustment(conn, {
        studentExternalId: input.studentId,
        term: parsedTerm.term,
        year: parsedTerm.year,
        description: `${line.description} [store order #${orderId}]`.slice(0, 255),
        amount: line.lineTotal,
        category: line.category,
        adjustmentSource: "store_purchase",
      });
      adjustmentIds.push(adjId);
      await insertStoreOrderItem(conn, {
        orderId,
        feeCode: line.feeCode,
        description: line.description,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        billingAdjustmentId: adjId,
        notes: line.notes,
      });
    }

    await markStoreOrderPaid(conn, {
      orderId,
      providerTransactionId: charged.transactionId,
      invoiceNumber,
    });

    await conn.execute(
      `INSERT INTO portal_payments
        (student_external_id, term, year, amount, paid_at, method, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.studentId.trim(),
        parsedTerm.term.trim(),
        Math.trunc(parsedTerm.year),
        base,
        new Date().toISOString().slice(0, 10),
        "authorize_net",
        `Authorize.net store order #${orderId} payment ${charged.transactionId}${feePart}`.slice(
          0,
          255,
        ),
      ],
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return {
    orderId,
    amount: total.toFixed(2),
    baseAmount: base.toFixed(2),
    processingFee: fee.toFixed(2),
    cardFunding,
    providerTransactionId: charged.transactionId,
    invoiceNumber,
    adjustmentIds,
  };
}
