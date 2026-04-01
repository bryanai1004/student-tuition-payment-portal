import mongoose from 'mongoose'

/**
 * Billing choices for a term — drives installment service fee (catalog: $15 per installment, max 3, cap $45).
 */
const studentTermPreferenceSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    term: { type: String, required: true },
    year: { type: Number, required: true },
    /** When true, tuition was satisfied during registration; no installment service fee for that term. */
    tuitionPaidInFullDuringRegistration: { type: Boolean, default: false },
    /** Quarterly installment plan; 2 or 3 payments when useInstallmentPlan is true. */
    useInstallmentPlan: { type: Boolean, default: false },
    installmentCount: { type: Number, min: 2, max: 3, default: 3 },
    /** Registration period end (ISO); used only for display / policy copy */
    registrationPeriodEnds: { type: String },
  },
  { collection: 'student_term_preferences' },
)

studentTermPreferenceSchema.index({ studentId: 1, term: 1, year: 1 }, { unique: true })

export const StudentTermPreference = mongoose.model('StudentTermPreference', studentTermPreferenceSchema)
