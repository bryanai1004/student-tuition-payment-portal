import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db.js";

type RecordAuthorizePaymentInput = {
  studentId: string;
  term: string;
  year: number;
  amount: number;
  paidAt: string;
  method: string;
  description: string | null;
  providerTransactionId: string;
  invoiceNumber: string;
  status: "pending" | "succeeded" | "failed";
};

let hasAuthorizeTransactionTableCache: boolean | null = null;

async function hasAuthorizeTransactionTable(
  connection: PoolConnection,
): Promise<boolean> {
  if (hasAuthorizeTransactionTableCache != null) {
    return hasAuthorizeTransactionTableCache;
  }
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'portal_payment_transactions'`,
  );
  const count = Number(rows[0]?.c ?? 0);
  hasAuthorizeTransactionTableCache = Number.isFinite(count) && count > 0;
  return hasAuthorizeTransactionTableCache;
}

/**
 * Stores payment in `portal_payments` (ledger source of truth) and writes an
 * optional provider transaction row when `portal_payment_transactions` exists.
 */
export async function recordAuthorizeNetPayment(
  input: RecordAuthorizePaymentInput,
): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO portal_payments
        (student_external_id, term, year, amount, paid_at, method, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.studentId.trim(),
        input.term.trim(),
        Math.trunc(input.year),
        input.amount,
        input.paidAt.trim().slice(0, 10),
        input.method.trim(),
        input.description,
      ],
    );

    if (await hasAuthorizeTransactionTable(connection)) {
      await connection.execute(
        `INSERT INTO portal_payment_transactions
          (student_id, term, amount, status, provider, provider_transaction_id, invoice_number)
         VALUES (?, ?, ?, ?, 'authorize_net', ?, ?)`,
        [
          input.studentId.trim(),
          `${Math.trunc(input.year)}-${input.term.trim().slice(0, 3).toUpperCase()}`,
          input.amount,
          input.status,
          input.providerTransactionId.trim(),
          input.invoiceNumber.trim(),
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
