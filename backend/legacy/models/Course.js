import mongoose from 'mongoose'

/** @typedef {'didactic' | 'clinical' | 'lab' | 'other'} CourseType */

const courseSchema = new mongoose.Schema(
  {
    courseId: { type: String, required: true, unique: true, index: true },
    courseCode: { type: String, required: true },
    title: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['didactic', 'clinical', 'lab', 'other'],
    },
    units: { type: Number },
    hours: { type: Number },
  },
  { collection: 'courses' },
)

export const Course = mongoose.model('Course', courseSchema)
