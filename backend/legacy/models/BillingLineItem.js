import mongoose from 'mongoose'

/**
 * Persisted ledger lines (adjustments, manually posted charges, or statement snapshots).
 * Routine tuition/clinical lines are normally computed from enrollments + catalog in billingService.
 */
const billingLineItemSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    term: { type: String, required: true },
    year: { type: Number, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: {
      type: String,
      required: true,
      enum: ['tuition', 'clinical', 'fees', 'other'],
    },
    /** ISO date string for activity ordering */
    effectiveDate: { type: String },
    source: {
      type: String,
      enum: ['computed_snapshot', 'adjustment', 'manual'],
      default: 'manual',
    },
  },
  { collection: 'billing_line_items', timestamps: true },
)

billingLineItemSchema.index({ studentId: 1, term: 1, year: 1 })

export const BillingLineItem = mongoose.model('BillingLineItem', billingLineItemSchema)
