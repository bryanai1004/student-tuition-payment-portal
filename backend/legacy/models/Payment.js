import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    term: { type: String, required: true },
    year: { type: Number, required: true },
    amount: { type: Number, required: true },
    /** ISO date */
    paidAt: { type: String, required: true },
    method: { type: String, enum: ['ach', 'card', 'check', 'other'], default: 'ach' },
    description: { type: String, default: 'Payment' },
  },
  { collection: 'payments', timestamps: true },
)

paymentSchema.index({ studentId: 1, term: 1, year: 1 })

export const Payment = mongoose.model('Payment', paymentSchema)
