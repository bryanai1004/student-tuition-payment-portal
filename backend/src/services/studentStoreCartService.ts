import { pool } from "../lib/db.js";
import { getStoreFeeSku } from "../config/storeFeeCatalog.js";
import {
  deleteStoreCartPendingAdjustment,
  insertPortalBillingAdjustment,
  promoteStoreCartPendingAdjustments,
  updateStoreCartPendingAdjustment,
} from "../repositories/adminFinanceRepository.js";
import {
  countStoreOrderItems,
  deleteCartOrder,
  deleteStoreOrderItem,
  findStoreOrderItemByFeeCode,
  getActiveCartOrder,
  insertStoreOrder,
  insertStoreOrderItem,
  linkStoreOrderItemBillingAdjustment,
  listStoreOrderItems,
  portalStoreTablesExist,
  updateStoreOrderItem,
  updateStoreOrderSubtotal,
} from "../repositories/studentStoreRepository.js";
import type { StoreCartLineInput } from "./studentStoreService.js";
import { resolveTermFromBody } from "./studentStoreService.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type StoreCartLineDto = {
  feeCode: string;
  name: string;
  unitPriceUsd: number;
  quantity: number;
  allowQuantity: boolean;
  maxQuantity: number;
  notes: string | null;
  /** Set after cart is committed to AMUbill ledger; 0 while cart-only. */
  adjustmentId: number;
  lineTotal: number;
  onBill: boolean;
};

export type StoreCartPayload = {
  term: string;
  year: number;
  orderId: number | null;
  items: StoreCartLineDto[];
  subtotal: number;
};

function cartLineDescription(nameEn: string, quantity: number): string {
  const base = `Store: ${nameEn}`;
  const withQty = quantity > 1 ? `${base} (×${quantity})` : base;
  return `${withQty} [cart]`.slice(0, 255);
}

function cartLineNameFromDescription(description: string): string {
  const stripped = description
    .replace(/\s*\[cart\]\s*$/i, "")
    .replace(/^Store:\s*/i, "")
    .replace(/\s*\(×\d+\)\s*$/i, "")
    .trim();
  return stripped || description;
}

function mapCartItemRow(row: {
  feeCode: string;
  description: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  billingAdjustmentId: number | null;
  notes: string | null;
}): StoreCartLineDto {
  const sku = getStoreFeeSku(row.feeCode);
  const adjustmentId =
    row.billingAdjustmentId != null && row.billingAdjustmentId > 0
      ? row.billingAdjustmentId
      : 0;
  return {
    feeCode: row.feeCode,
    name: sku?.nameEn ?? cartLineNameFromDescription(row.description),
    unitPriceUsd: row.unitPrice,
    quantity: row.quantity,
    allowQuantity: sku?.allowQuantity ?? false,
    maxQuantity: sku?.maxQuantity ?? 1,
    notes: row.notes,
    adjustmentId,
    lineTotal: row.lineTotal,
    onBill: adjustmentId > 0,
  };
}

async function buildCartPayload(
  studentId: string,
  term: string,
  year: number,
): Promise<StoreCartPayload> {
  const order = await getActiveCartOrder(pool, studentId, term, year);
  if (order == null) {
    return { term, year, orderId: null, items: [], subtotal: 0 };
  }
  const rows = await listStoreOrderItems(pool, order.id);
  const items = rows.map(mapCartItemRow);
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));
  return { term, year, orderId: order.id, items, subtotal };
}

function storeUnavailableError(): Error {
  return new Error(
    "Fee store is not available yet. Run `supabase db push` from the repo root (migration 20260629233852_portal_store_orders.sql).",
  );
}

export async function getStoreCartPayload(input: {
  studentId: string;
  term: string;
  year: number;
}): Promise<StoreCartPayload> {
  if (!(await portalStoreTablesExist(pool))) {
    throw storeUnavailableError();
  }
  const parsedTerm = resolveTermFromBody(input.term, input.year);
  if (!parsedTerm) {
    throw new Error("term and year must identify a valid quarter.");
  }
  return buildCartPayload(input.studentId, parsedTerm.term, parsedTerm.year);
}

/**
 * Cart-only sync: updates portal_store_order_items without touching the ledger.
 * If the line is already on the bill (linked adjustment), quantity/amount updates
 * stay in sync with the pending adjustment.
 */
export async function syncStoreCartLine(input: {
  studentId: string;
  term: string;
  year: number;
  line: StoreCartLineInput;
}): Promise<StoreCartPayload> {
  if (!(await portalStoreTablesExist(pool))) {
    throw storeUnavailableError();
  }
  const parsedTerm = resolveTermFromBody(input.term, input.year);
  if (!parsedTerm) {
    throw new Error("term and year must identify a valid quarter.");
  }
  const feeCode = String(input.line.feeCode ?? "").trim();
  const sku = getStoreFeeSku(feeCode);
  if (!sku) {
    throw new Error(`Unknown fee code: ${feeCode || "(empty)"}`);
  }
  const qtyRaw = Math.trunc(Number(input.line.quantity));
  const quantity =
    sku.allowQuantity ? Math.max(1, Math.min(qtyRaw || 1, sku.maxQuantity)) : 1;
  const unitPrice = roundMoney(sku.unitPriceUsd);
  const lineTotal = roundMoney(unitPrice * quantity);
  const notes =
    input.line.notes != null && String(input.line.notes).trim() !== ""
      ? String(input.line.notes).trim().slice(0, 500)
      : null;
  const description = cartLineDescription(sku.nameEn, quantity);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let order = await getActiveCartOrder(conn, input.studentId, parsedTerm.term, parsedTerm.year);
    if (order == null) {
      const orderId = await insertStoreOrder(conn, {
        studentExternalId: input.studentId,
        term: parsedTerm.term,
        year: parsedTerm.year,
        subtotal: 0,
        status: "cart",
      });
      order = {
        id: orderId,
        studentExternalId: input.studentId,
        term: parsedTerm.term,
        year: parsedTerm.year,
        status: "cart",
        subtotal: 0,
        providerTransactionId: null,
        invoiceNumber: null,
        createdAt: "",
        paidAt: null,
      };
    }

    const existing = await findStoreOrderItemByFeeCode(conn, order.id, feeCode);
    if (existing != null) {
      if (existing.billingAdjustmentId != null) {
        await updateStoreCartPendingAdjustment(conn, existing.billingAdjustmentId, {
          description,
          amount: lineTotal,
        });
      }
      await updateStoreOrderItem(conn, existing.id, {
        quantity,
        lineTotal,
        description,
        notes,
      });
    } else {
      await insertStoreOrderItem(conn, {
        orderId: order.id,
        feeCode: sku.code,
        description,
        unitPrice,
        quantity,
        lineTotal,
        billingAdjustmentId: null,
        notes,
      });
    }

    const items = await listStoreOrderItems(conn, order.id);
    const subtotal = roundMoney(items.reduce((sum, row) => sum + row.lineTotal, 0));
    await updateStoreOrderSubtotal(conn, order.id, subtotal);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return buildCartPayload(input.studentId, parsedTerm.term, parsedTerm.year);
}

/** Push cart lines onto AMUbill as pending store adjustments (checkout from cart). */
export async function commitStoreCartToLedger(input: {
  studentId: string;
  term: string;
  year: number;
}): Promise<StoreCartPayload> {
  if (!(await portalStoreTablesExist(pool))) {
    throw storeUnavailableError();
  }
  const parsedTerm = resolveTermFromBody(input.term, input.year);
  if (!parsedTerm) {
    throw new Error("term and year must identify a valid quarter.");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const order = await getActiveCartOrder(
      conn,
      input.studentId,
      parsedTerm.term,
      parsedTerm.year,
    );
    if (order == null) {
      throw new Error("Your cart is empty.");
    }

    const items = await listStoreOrderItems(conn, order.id);
    if (items.length === 0) {
      throw new Error("Your cart is empty.");
    }

    for (const item of items) {
      if (item.billingAdjustmentId != null && item.billingAdjustmentId > 0) {
        continue;
      }
      const sku = getStoreFeeSku(item.feeCode);
      if (!sku) {
        throw new Error(`Unknown fee code in cart: ${item.feeCode}`);
      }
      const adjId = await insertPortalBillingAdjustment(conn, {
        studentExternalId: input.studentId,
        term: parsedTerm.term,
        year: parsedTerm.year,
        description: item.description,
        amount: item.lineTotal,
        category: sku.category,
        adjustmentSource: "store_cart_pending",
      });
      await linkStoreOrderItemBillingAdjustment(conn, item.id, adjId);
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return buildCartPayload(input.studentId, parsedTerm.term, parsedTerm.year);
}

/** Remove a cart line; if it was committed to the bill, remove the ledger row too. */
export async function removeStoreCartLine(input: {
  studentId: string;
  term: string;
  year: number;
  feeCode: string;
}): Promise<StoreCartPayload> {
  if (!(await portalStoreTablesExist(pool))) {
    throw storeUnavailableError();
  }
  const parsedTerm = resolveTermFromBody(input.term, input.year);
  if (!parsedTerm) {
    throw new Error("term and year must identify a valid quarter.");
  }
  const feeCode = String(input.feeCode ?? "").trim();
  if (feeCode === "") {
    throw new Error("feeCode is required.");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const order = await getActiveCartOrder(
      conn,
      input.studentId,
      parsedTerm.term,
      parsedTerm.year,
    );
    if (order != null) {
      const existing = await findStoreOrderItemByFeeCode(conn, order.id, feeCode);
      if (existing != null) {
        if (existing.billingAdjustmentId != null) {
          await deleteStoreCartPendingAdjustment(conn, existing.billingAdjustmentId);
        }
        await deleteStoreOrderItem(conn, existing.id);
        const remaining = await countStoreOrderItems(conn, order.id);
        if (remaining === 0) {
          await deleteCartOrder(conn, order.id);
        } else {
          const left = await listStoreOrderItems(conn, order.id);
          const subtotal = roundMoney(left.reduce((sum, row) => sum + row.lineTotal, 0));
          await updateStoreOrderSubtotal(conn, order.id, subtotal);
        }
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return buildCartPayload(input.studentId, parsedTerm.term, parsedTerm.year);
}

export async function finalizeStoreCartAdjustmentsOnPayment(input: {
  studentId: string;
  term: string;
  year: number;
  adjustmentIds: number[];
  providerTransactionId: string;
  invoiceNumber: string;
}): Promise<void> {
  if (!(await portalStoreTablesExist(pool))) return;
  const parsedTerm = resolveTermFromBody(input.term, input.year);
  if (!parsedTerm) return;
  const ids = input.adjustmentIds
    .map((id) => Math.trunc(Number(id)))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const order = await getActiveCartOrder(
      conn,
      input.studentId,
      parsedTerm.term,
      parsedTerm.year,
    );
    if (order == null) {
      await conn.commit();
      return;
    }

    await promoteStoreCartPendingAdjustments(conn, {
      adjustmentIds: ids,
      orderId: order.id,
    });

    const items = await listStoreOrderItems(conn, order.id);
    const promotedIds = new Set(ids);
    for (const item of items) {
      if (
        item.billingAdjustmentId != null &&
        promotedIds.has(item.billingAdjustmentId)
      ) {
        await deleteStoreOrderItem(conn, item.id);
      }
    }

    const remaining = await countStoreOrderItems(conn, order.id);
    if (remaining === 0) {
      await conn.execute(
        `UPDATE portal_store_orders
         SET status = 'paid',
             provider_transaction_id = ?,
             invoice_number = ?,
             paid_at = CURRENT_TIMESTAMP,
             subtotal = 0
         WHERE id = ?`,
        [
          input.providerTransactionId.trim(),
          input.invoiceNumber.trim(),
          Math.trunc(order.id),
        ],
      );
    } else {
      const left = await listStoreOrderItems(conn, order.id);
      const subtotal = roundMoney(left.reduce((sum, row) => sum + row.lineTotal, 0));
      await updateStoreOrderSubtotal(conn, order.id, subtotal);
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
