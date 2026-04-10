import type { MarksRow } from "../repositories/studentAcademicsRepository.js";
import type {
  LegacyAccountingRow,
  LegacyAccountSnapshot,
} from "../repositories/studentLegacyAccountRepository.js";
import type { PortalEnrollmentAcademicRow } from "../repositories/studentEnrollmentRepository.js";
import type { CourseTranscriptLookupEntry } from "../repositories/studentTranscriptRepository.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import type {
  AccountScheduleTermOption,
  ClinicalProgress,
  PaymentRecord,
  StudentAccountPayload,
} from "../types/studentAccount.js";
import {
  buildAcademicCourseRecordsFromMarksWithLookup,
  portalEnrollmentRowToAcademicCourseRecord,
  resolveCourseDisplayTitle,
  resolveRegistrationAnchoredAcademicTermConsideringPortal,
  scheduleRowsFromAcademicCourseRecords,
  termsMatch,
} from "./studentAcademicCourseRecords.js";
import {
  buildAccountCurrentTerm,
  deriveAccountRegistration,
} from "./studentAccountDashboard.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Legacy `accounting.date` is stored as YYYYMMDD (int). Emit ISO date for API / frontend. */
export function legacyAccountingDateToIso(dateRaw: number): string {
  const n = Math.trunc(Number(dateRaw));
  if (!Number.isFinite(n) || n < 19000101 || n > 21001231) {
    return "1970-01-01";
  }
  const s = String(n).padStart(8, "0");
  const y = s.slice(0, 4);
  const m = s.slice(4, 6);
  const d = s.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function typeNorm(type: string): string {
  return type.trim().toLowerCase();
}

/**
 * Real-student payload: legacy `students` + `registration` + `accounting` (Step 3B).
 * Category splits are minimal; `lineItems` and portal-only fields stay empty until later steps.
 */
export type AssembleLegacyStudentAccountOptions = {
  /** Active enrollment term from legacy+portal anchor and marks/portal open-enrollment rules; drives `currentTerm`. */
  portalActiveTerm: { term: string; year: number } | null;
  availableScheduleTerms: AccountScheduleTermOption[];
  clinicalProgress: ClinicalProgress;
  /**
   * When non-empty, browsed-term schedule rows merge **active** portal didactic enrollments with
   * marks (portal wins on duplicate course code). Withdrawn portal rows stay out of the timetable.
   */
  portalEnrollmentRows?: PortalEnrollmentAcademicRow[];
};

function mergeBrowseTermScheduleRecords(
  portalRecords: StudentAcademicCourseRecord[],
  marksRecords: StudentAcademicCourseRecord[],
): StudentAcademicCourseRecord[] {
  const byKey = new Map<string, StudentAcademicCourseRecord>();
  const portalKey = (r: StudentAcademicCourseRecord) => {
    const sec = (r.sectionCode ?? "").trim().toLowerCase();
    const tr = (r.scheduleTrack ?? "").trim().toLowerCase();
    const id = r.portalEnrollmentRowId ?? 0;
    return `portal:${r.courseCode.trim().toLowerCase()}|${sec}|${tr}|${id}`;
  };
  const marksKey = (r: StudentAcademicCourseRecord) =>
    `marks:${r.courseCode.trim().toLowerCase()}`;
  for (const r of portalRecords) {
    if (r.status === "withdrawn") continue;
    byKey.set(portalKey(r), r);
  }
  for (const r of marksRecords) {
    if (r.status === "withdrawn") continue;
    const k = marksKey(r);
    if (!byKey.has(k)) byKey.set(k, r);
  }
  return [...byKey.values()].sort((a, b) =>
    a.courseCode.localeCompare(b.courseCode, undefined, {
      sensitivity: "base",
    }),
  );
}

export function assembleLegacyStudentAccountPayload(
  snap: LegacyAccountSnapshot,
  accountingRows: LegacyAccountingRow[],
  /** All `marks` rows for the student (newest term first), same source as `/academics`. */
  allMarksRows: MarksRow[],
  courseLookup: Map<string, CourseTranscriptLookupEntry>,
  options: AssembleLegacyStudentAccountOptions,
): StudentAccountPayload {
  const regFees = roundMoney(snap.totalFees);

  let totalCharges: number;
  let paymentsTotal: number;
  let outstandingBalance: number;
  let tuitionTotal: number;
  let feesTotal: number;
  let otherTotal: number;
  let payments: PaymentRecord[];

  if (accountingRows.length === 0) {
    totalCharges = regFees;
    paymentsTotal = 0;
    outstandingBalance = regFees;
    tuitionTotal = 0;
    feesTotal = 0;
    otherTotal = 0;
    payments = [];
  } else {
    const sumDebit = accountingRows.reduce((s, r) => s + r.debit, 0);
    const sumCredit = accountingRows.reduce((s, r) => s + r.credit, 0);
    totalCharges = roundMoney(sumDebit);
    paymentsTotal = roundMoney(sumCredit);
    outstandingBalance = roundMoney(sumDebit - sumCredit);

    tuitionTotal = 0;
    feesTotal = 0;
    for (const r of accountingRows) {
      const tk = typeNorm(r.type);
      if (tk === "tuition") tuitionTotal += r.debit;
      else if (tk === "fee") feesTotal += r.debit;
    }
    tuitionTotal = roundMoney(tuitionTotal);
    feesTotal = roundMoney(feesTotal);

    const clinicalTotal = 0;
    otherTotal = roundMoney(
      totalCharges - tuitionTotal - feesTotal - clinicalTotal,
    );

    payments = accountingRows
      .filter((r) => r.credit > 0)
      .map((r) => ({
        amount: roundMoney(r.credit),
        paidAt: legacyAccountingDateToIso(r.date),
        method: "legacy",
        description: r.memo.length > 0 ? r.memo : undefined,
      }));
  }

  const browseTerm = { term: snap.term, year: snap.year };
  const { portalActiveTerm, availableScheduleTerms, clinicalProgress } = options;
  const portalRows = options.portalEnrollmentRows ?? [];

  const marksRowsForBrowse = allMarksRows.filter(
    (m) => m.year === browseTerm.year && termsMatch(m.term, browseTerm.term),
  );
  const courseRecords = buildAcademicCourseRecordsFromMarksWithLookup(
    snap.studentId,
    allMarksRows,
    courseLookup,
    portalActiveTerm,
  );
  const browseRecords = courseRecords.filter(
    (r) => r.year === browseTerm.year && termsMatch(r.term, browseTerm.term),
  );

  /**
   * Schedule merge uses **all** non-withdrawn portal rows for the browse term. Do not apply
   * `legacyCompletedBlocksPortalRow` here: marks may already carry final grades while still lacking
   * `days` / `time_from` / `time_to`; excluding portal rows then yields empty or unparsable schedules.
   * (Enrollment/transcript merge in `/academics` keeps the stricter portal filter.)
   */
  const portalRowsInBrowseTerm = portalRows.filter(
    (p) => p.year === browseTerm.year && termsMatch(p.term, browseTerm.term),
  );
  const activePortalEnrollmentCountForBrowseTerm = portalRowsInBrowseTerm.filter(
    (p) => p.status !== "withdrawn",
  ).length;

  const portalRowsForScheduleMerge = portalRowsInBrowseTerm.filter(
    (p) => p.status !== "withdrawn",
  );

  /**
   * Portal rows from `listPortalEnrollmentRowsForStudentAcademics` include `weekday`,
   * `start_time`, `end_time`, and optional `instructor` via `course_sections` joined on
   * catalog `course_code` + enrollment `term` + `year`, so `scheduleRowsFromAcademicCourseRecords`
   * can render timetables for terms without marks.
   */
  const portalBrowseRecords = portalRowsForScheduleMerge.map((p) =>
    portalEnrollmentRowToAcademicCourseRecord(
      snap.studentId,
      p,
      resolveCourseDisplayTitle(
        p.course_code,
        p.course_title_raw.length > 0 ? p.course_title_raw : p.course_code,
        courseLookup,
      ),
      portalActiveTerm,
    ),
  );

  const scheduleSourceRecords =
    portalBrowseRecords.length > 0
      ? mergeBrowseTermScheduleRecords(portalBrowseRecords, browseRecords)
      : browseRecords.filter((r) => r.status !== "withdrawn");
  const scheduleRows =
    scheduleRowsFromAcademicCourseRecords(scheduleSourceRecords);
  const currentTerm =
    portalActiveTerm != null
      ? buildAccountCurrentTerm(portalActiveTerm.term, portalActiveTerm.year)
      : null;
  const browseLabel = buildAccountCurrentTerm(snap.term, snap.year).label;
  const browseMatchesPortalActive =
    portalActiveTerm != null &&
    portalActiveTerm.year === browseTerm.year &&
    termsMatch(portalActiveTerm.term, browseTerm.term);

  const registration = deriveAccountRegistration({
    scheduleRows,
    termLabel: browseLabel,
    ...(browseMatchesPortalActive
      ? {
          academicEnrollmentActive:
            resolveRegistrationAnchoredAcademicTermConsideringPortal(
              browseTerm,
              allMarksRows,
              portalRows,
            ) != null,
          marksRowsForRegistrationTerm: marksRowsForBrowse.length,
        }
      : {}),
  });

  return {
    program: null,
    term: snap.term,
    year: snap.year,
    studentId: snap.studentId,
    student: {
      name: snap.displayName,
      studentId: snap.studentId,
      term: snap.term,
      year: snap.year,
    },
    preference: null,
    lineItems: [],
    summary: {
      tuitionTotal,
      clinicalTotal: 0,
      feesTotal,
      otherTotal,
      totalCharges,
      payments: paymentsTotal,
      outstandingBalance,
    },
    scheduleRows,
    activePortalEnrollmentCountForBrowseTerm,
    currentTerm,
    availableScheduleTerms,
    registration,
    payments,
    installmentSchedule: [],
    installmentPolicy: [],
    billingStatus: null,
    termChargeEffectiveDate: null,
    clinicalProgress,
  };
}
