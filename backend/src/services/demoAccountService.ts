import { DEMO_STUDENT_ID } from "../config/constants.js";
import { MAHM_COURSES } from "../data/mahmCatalog.js";
import type { PaymentRecord, StudentTermPreference } from "../types/studentAccount.js";
import { assembleStudentAccountPayload } from "./studentAccountAssembler.js";

const CATALOG_DEMO_COURSE_IDS = [
  "MAHM101",
  "MAHM102",
  "MAHM104",
  "MAHM113",
  "CLINIC1",
] as const;

const CATALOG_DEMO_PREFERENCE: StudentTermPreference = {
  useInstallmentPlan: true,
  tuitionPaidInFullDuringRegistration: false,
  installmentCount: 3,
  registrationPeriodEnds: "2026-09-05",
};

const CATALOG_DEMO_PAYMENTS: PaymentRecord[] = [
  {
    amount: 1250,
    paidAt: "2026-08-20",
    method: "ach",
    description: "Tuition payment — Fall 2026",
  },
];

/**
 * Catalog-computed demo account (no database reads). Matches the former Mongo-empty fallback.
 */
export function getCatalogDemoAccountPayload(term: string, year: number) {
  const ids = new Set<string>(CATALOG_DEMO_COURSE_IDS);
  const courses = MAHM_COURSES.filter((c) => ids.has(c.courseId));
  const enrollments = CATALOG_DEMO_COURSE_IDS.map((courseId) => ({
    studentId: DEMO_STUDENT_ID,
    courseId,
    term,
    year,
  }));
  return assembleStudentAccountPayload({
    studentId: DEMO_STUDENT_ID,
    term,
    year,
    enrollments,
    preference: CATALOG_DEMO_PREFERENCE,
    payments: CATALOG_DEMO_PAYMENTS,
    adjustments: [],
    courses,
  });
}
