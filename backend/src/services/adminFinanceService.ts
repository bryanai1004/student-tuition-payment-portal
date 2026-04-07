import { pool } from "../lib/db.js";
import {
  insertPortalBillingAdjustment,
  insertPortalPayment,
  listFinanceRosterRows,
  type PortalBillingCategory,
} from "../repositories/adminFinanceRepository.js";
import {
  getAccountingLedgerPayload,
  getAccountingQuartersPayload,
} from "./studentLedgerService.js";

export type AdminFinanceStudentRow = {
  studentId: string;
  name: string;
  balance: number;
};

const CHARGE_CATEGORIES: PortalBillingCategory[] = [
  "fees",
  "other",
  "tuition",
  "clinical",
];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

async function balanceForLatestQuarter(studentId: string): Promise<number> {
  const { quarters } = await getAccountingQuartersPayload(studentId);
  if (quarters.length === 0) {
    return 0;
  }
  const q = quarters[0]!;
  const ledger = await getAccountingLedgerPayload(studentId, q.term, q.year);
  if (ledger == null) {
    return 0;
  }
  return roundMoney(ledger.summary.balance);
}

export async function listAdminFinanceStudents(): Promise<
  AdminFinanceStudentRow[]
> {
  const roster = await listFinanceRosterRows(pool);
  const out: AdminFinanceStudentRow[] = await Promise.all(
    roster.map(async (r) => ({
      studentId: r.studentId,
      name: r.name,
      balance: await balanceForLatestQuarter(r.studentId),
    })),
  );
  return out;
}

export async function getAdminFinanceQuarters(studentId: string) {
  return getAccountingQuartersPayload(studentId);
}

export async function getAdminFinanceLedger(
  studentId: string,
  term: string,
  year: number,
) {
  return getAccountingLedgerPayload(studentId, term.trim(), year);
}

export type PostAdminChargeInput = {
  studentId: string;
  term: string;
  year: number;
  description: string;
  amount: number;
  category?: PortalBillingCategory;
};

export type PostAdminPaymentInput = {
  studentId: string;
  term: string;
  year: number;
  amount: number;
  paidAt?: string;
  method?: string;
  description?: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseCategory(raw: unknown): PortalBillingCategory | null {
  if (raw === undefined || raw === null) return "fees";
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return "fees";
  if ((CHARGE_CATEGORIES as string[]).includes(s)) {
    return s as PortalBillingCategory;
  }
  return null;
}

export function validatePostChargeBody(
  raw: unknown,
): { ok: true; data: PostAdminChargeInput } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
  const term = typeof o.term === "string" ? o.term.trim() : "";
  const yearRaw = o.year;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
        ? Number(yearRaw)
        : Number.NaN;
  const description =
    typeof o.description === "string" ? o.description.trim() : "";
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : Number.NaN;

  if (studentId === "" || term === "" || !Number.isFinite(year)) {
    return {
      ok: false,
      error:
        "studentId, term, and year are required; year must be a finite number.",
    };
  }
  if (description === "") {
    return { ok: false, error: "description is required." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a number greater than 0." };
  }

  const category = parseCategory(o.category);
  if (category == null) {
    return {
      ok: false,
      error:
        "category must be one of: fees, other, tuition, clinical (or omit for fees).",
    };
  }

  return {
    ok: true,
    data: {
      studentId,
      term,
      year: Math.trunc(year),
      description,
      amount: roundMoney(amount),
      category,
    },
  };
}

export function validatePostPaymentBody(
  raw: unknown,
): { ok: true; data: PostAdminPaymentInput } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
  const term = typeof o.term === "string" ? o.term.trim() : "";
  const yearRaw = o.year;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
        ? Number(yearRaw)
        : Number.NaN;
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : Number.NaN;

  if (studentId === "" || term === "" || !Number.isFinite(year)) {
    return {
      ok: false,
      error:
        "studentId, term, and year are required; year must be a finite number.",
    };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a number greater than 0." };
  }

  let paidAt: string | undefined;
  if (o.paidAt === undefined || o.paidAt === null) {
    paidAt = todayIsoDate();
  } else if (typeof o.paidAt === "string" && o.paidAt.trim() !== "") {
    paidAt = o.paidAt.trim().slice(0, 10);
  } else {
    return {
      ok: false,
      error: "paidAt must be an ISO date string (YYYY-MM-DD) or omitted.",
    };
  }

  const method =
    o.method === undefined || o.method === null
      ? "admin"
      : typeof o.method === "string" && o.method.trim() !== ""
        ? o.method.trim()
        : null;
  if (method == null) {
    return { ok: false, error: "method must be a non-empty string or omitted." };
  }

  const description =
    o.description === undefined || o.description === null
      ? "Admin recorded payment"
      : typeof o.description === "string"
        ? o.description.trim() || "Admin recorded payment"
        : null;
  if (description == null) {
    return { ok: false, error: "description must be a string or omitted." };
  }

  return {
    ok: true,
    data: {
      studentId,
      term,
      year: Math.trunc(year),
      amount: roundMoney(amount),
      paidAt,
      method,
      description,
    },
  };
}

export async function postAdminFinanceCharge(
  input: PostAdminChargeInput,
): Promise<void> {
  await insertPortalBillingAdjustment(pool, {
    studentExternalId: input.studentId,
    term: input.term,
    year: input.year,
    description: input.description,
    amount: input.amount,
    category: input.category ?? "fees",
  });
}

export async function postAdminFinancePayment(
  input: PostAdminPaymentInput,
): Promise<void> {
  await insertPortalPayment(pool, {
    studentExternalId: input.studentId,
    term: input.term,
    year: input.year,
    amount: input.amount,
    paidAt: input.paidAt ?? todayIsoDate(),
    method: input.method ?? "admin",
    description: input.description ?? "Admin recorded payment",
  });
}
