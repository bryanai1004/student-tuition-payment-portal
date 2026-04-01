import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import { MAHM_COURSES } from './mahcCourses.js'
import { Course } from '../models/Course.js'
import { Enrollment } from '../models/Enrollment.js'
import { Payment } from '../models/Payment.js'
import { StudentTermPreference } from '../models/StudentTermPreference.js'
import { DEMO_STUDENT_ID } from '../constants.js'

const TERM = 'Fall'
const YEAR = 2026

export async function runSeed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student-tuition-portal'
  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  await Promise.all([
    Course.deleteMany({}),
    Enrollment.deleteMany({}),
    Payment.deleteMany({}),
    StudentTermPreference.deleteMany({}),
  ])

  await Course.insertMany(MAHM_COURSES)

  await Enrollment.insertMany([
    { studentId: DEMO_STUDENT_ID, courseId: 'MAHM101', term: TERM, year: YEAR },
    { studentId: DEMO_STUDENT_ID, courseId: 'MAHM102', term: TERM, year: YEAR },
    { studentId: DEMO_STUDENT_ID, courseId: 'MAHM104', term: TERM, year: YEAR },
    { studentId: DEMO_STUDENT_ID, courseId: 'MAHM113', term: TERM, year: YEAR },
    { studentId: DEMO_STUDENT_ID, courseId: 'CLINIC1', term: TERM, year: YEAR },
  ])

  await StudentTermPreference.create({
    studentId: DEMO_STUDENT_ID,
    term: TERM,
    year: YEAR,
    useInstallmentPlan: true,
    tuitionPaidInFullDuringRegistration: false,
    installmentCount: 3,
    registrationPeriodEnds: '2026-09-05',
  })

  await Payment.create({
    studentId: DEMO_STUDENT_ID,
    term: TERM,
    year: YEAR,
    amount: 1250,
    paidAt: '2026-08-20',
    method: 'ach',
    description: 'Tuition payment — Fall 2026',
  })

  console.log('Seed complete for MAHM demo student:', DEMO_STUDENT_ID)
  await mongoose.disconnect()
}

const __filename = fileURLToPath(import.meta.url)
/** Normalize paths so `node seed/seed.js` works when argv[1] is relative. */
const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(__filename)
if (isMain) {
  runSeed().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
