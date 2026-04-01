import mongoose from 'mongoose'

const enrollmentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    courseId: { type: String, required: true, index: true },
    term: { type: String, required: true },
    year: { type: Number, required: true },
  },
  { collection: 'enrollments' },
)

enrollmentSchema.index({ studentId: 1, term: 1, year: 1 })

export const Enrollment = mongoose.model('Enrollment', enrollmentSchema)
