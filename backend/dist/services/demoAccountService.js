import { DEMO_STUDENT_ID } from "../config/constants.js";
import { MAHM_COURSES } from "../data/mahmCatalog.js";
import { assembleStudentAccountPayload } from "./studentAccountAssembler.js";
const CATALOG_DEMO_COURSE_IDS = [
    "MAHM101",
    "MAHM102",
    "MAHM104",
    "MAHM113",
    "CLINIC1",
];
const CATALOG_DEMO_PREFERENCE = {
    useInstallmentPlan: true,
    tuitionPaidInFullDuringRegistration: false,
    installmentCount: 3,
    registrationPeriodEnds: "2026-09-05",
};
const CATALOG_DEMO_PAYMENTS = [
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
export function getCatalogDemoAccountPayload(term, year) {
    const ids = new Set(CATALOG_DEMO_COURSE_IDS);
    const courses = MAHM_COURSES.filter((c) => ids.has(c.courseId));
    const enrollments = CATALOG_DEMO_COURSE_IDS.map((courseId) => ({
        studentId: DEMO_STUDENT_ID,
        courseId,
        term,
        year,
    }));
    return assembleStudentAccountPayload({
        studentId: DEMO_STUDENT_ID,
        studentDisplayName: "Demo Student",
        term,
        year,
        enrollments,
        preference: CATALOG_DEMO_PREFERENCE,
        payments: CATALOG_DEMO_PAYMENTS,
        adjustments: [],
        courses,
    });
}
//# sourceMappingURL=demoAccountService.js.map