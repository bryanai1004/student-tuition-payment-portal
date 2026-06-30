/**
 * Account / billing layer: may **merge** legacy academic schedule views and clinical progress (`buildClinicalProgress`)
 * for the dashboard. Upstream services keep registration, attempts, transcript, and clinic progress separate.
 * Degree audit: `computeDegreeAudit` in `domain/studentDomainModels.ts` when wired — not inside transcript services.
 *
 * Portal schedule truth: `portal_enrollments` (by `student_external_id`, calendar `term`/`year`, `status`) maps through
 * `portal_courses` to timetable `course_sections` — see `listStudentEnrolledSectionsForTerm`. `academic_terms.id`
 * values (e.g. `2026-FAL`) are metadata for API routing only; calendar term names come from `academic_terms.term_name`.
 */

import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool, type Pool, type RowDataPacket } from "../lib/db.js";
import { listMarksForStudent } from "../repositories/studentAcademicsRepository.js";
import {
  findLatestLegacyTermYear,
  listLegacyRegistrationTermsForStudent,
  loadLegacyAccountSnapshot,
  loadLegacyAccountingRows,
} from "../repositories/studentLegacyAccountRepository.js";
import {
  findLatestTermYearForStudent,
  listPortalFinanceActivityTermsForStudent,
  loadAccountContext,
} from "../repositories/studentAccountRepository.js";
import {
  findLatestPortalEnrollmentTermYear,
  listPortalEnrollmentRowsForStudentAcademics,
  listStudentEnrolledSectionsForTerm,
} from "../repositories/studentEnrollmentRepository.js";
import { loadCoursesTranscriptLookup } from "../repositories/studentTranscriptRepository.js";
import type {
  AccountScheduleTermOption,
  StudentAccountPayload,
} from "../types/studentAccount.js";
import { getCatalogDemoAccountPayload } from "./demoAccountService.js";
import {
  pickNewerRegistrationAnchor,
  resolveActiveEnrollmentTerm,
  termSortOrder,
  termsMatch,
} from "./studentAcademicCourseRecords.js";
import { listAcademicTerms } from "../repositories/academicTermRepository.js";
import type { AcademicTermDetail } from "../types/academicTerm.js";
import { buildClinicalProgress } from "./clinicalProgressService.js";
import { assembleLegacyStudentAccountPayload } from "./studentLegacyAccountAssembler.js";
import { courseSectionDetailsToAccountScheduleRows } from "./portalEnrollmentSchedule.js";
import { buildAccountCurrentTerm } from "./studentAccountDashboard.js";
import { assembleStudentAccountPayload } from "./studentAccountAssembler.js";

export type AccountTermYearInput =
  | { mode: "explicit"; term: string; year: number }
  | { mode: "auto" };

function toScheduleTermOptions(
  pairs: { term: string; year: number }[],
): AccountScheduleTermOption[] {
  return pairs.map(({ term, year }) => {
    const ct = buildAccountCurrentTerm(term, year);
    return { term, year, label: ct.label };
  });
}

function mergeScheduleTermOptionLists(
  primary: AccountScheduleTermOption[],
  browseTerm: string,
  browseYear: number,
): AccountScheduleTermOption[] {
  const byKey = new Map<string, AccountScheduleTermOption>();
  for (const o of primary) {
    byKey.set(`${o.term.toLowerCase()}|${o.year}`, o);
  }
  const bKey = `${browseTerm.toLowerCase()}|${browseYear}`;
  if (!byKey.has(bKey)) {
    const ct = buildAccountCurrentTerm(browseTerm, browseYear);
    byKey.set(bKey, { term: browseTerm, year: browseYear, label: ct.label });
  }
  return [...byKey.values()].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return termSortOrder(b.term) - termSortOrder(a.term);
  });
}

/** Map portal/legacy calendar term + year → `academic_terms.id` when names or labels align. */
function academicTermIdForCalendarTerm(
  catalog: AcademicTermDetail[],
  calendarTerm: string,
  calendarYear: number,
): string | undefined {
  const y = Number(calendarYear);
  if (!Number.isFinite(y)) return undefined;
  const raw = calendarTerm.trim();
  if (raw === "") return undefined;
  const want = raw.toLowerCase();
  const compact = want.replace(/[\s_-]+/g, "");
  const aliasToCanon: Record<string, string> = {
    spr1: "spring",
    spring1: "spring",
    sum1: "summer",
    summer1: "summer",
    fal: "fall",
    fall1: "fall",
    win: "winter",
    winter1: "winter",
  };
  const canonFromAlias = aliasToCanon[compact];

  for (const a of catalog) {
    if (a.year !== y) continue;
    if (a.term_name.toLowerCase() === want) return a.id;
  }
  if (canonFromAlias) {
    for (const a of catalog) {
      if (a.year === y && a.term_name.toLowerCase() === canonFromAlias) {
        return a.id;
      }
    }
  }
  for (const a of catalog) {
    if (a.year !== y) continue;
    const lbl = a.term_label.trim().toLowerCase();
    if (lbl === want || lbl.startsWith(`${want} `) || lbl.includes(` ${want}`)) {
      return a.id;
    }
  }
  return undefined;
}

async function enrichScheduleTermsWithAcademicIds(
  terms: AccountScheduleTermOption[],
): Promise<AccountScheduleTermOption[]> {
  if (terms.length === 0) return terms;
  try {
    const catalog = await listAcademicTerms();
    return terms.map((t) => {
      if (t.academicTermId != null && t.academicTermId.trim() !== "") {
        return t;
      }
      const id = academicTermIdForCalendarTerm(catalog, t.term, t.year);
      return id != null ? { ...t, academicTermId: id } : t;
    });
  } catch (e) {
    console.warn(
      "[account] enrichScheduleTermsWithAcademicIds skipped:",
      e instanceof Error ? e.message : e,
    );
    return terms;
  }
}

/**
 * Legacy `registration` may be absent for a browse term even when the student has portal
 * enrollments or `marks` rows — avoid 404 on GET /account?term=&year= for those cases.
 */
async function resolveBrowseAccountSnapshot(
  snap: Awaited<ReturnType<typeof loadLegacyAccountSnapshot>>,
  dbPool: Pool,
  studentId: string,
  term: string,
  year: number,
  _termYearMode: AccountTermYearInput["mode"],
  portalEnrollmentRows: Awaited<
    ReturnType<typeof listPortalEnrollmentRowsForStudentAcademics>
  >,
  allMarksRows: Awaited<ReturnType<typeof listMarksForStudent>>,
): Promise<Awaited<ReturnType<typeof loadLegacyAccountSnapshot>>> {
  if (snap != null) return snap;

  const hasPortal = portalEnrollmentRows.some(
    (p) => p.year === year && termsMatch(p.term, term),
  );
  const hasMarks = allMarksRows.some(
    (m) => m.year === year && termsMatch(m.term, term),
  );
  if (!hasPortal && !hasMarks) return null;

  const [[studentRow]] = await dbPool.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name FROM students WHERE id = ? LIMIT 1`,
    [studentId],
  );
  if (studentRow == null) return null;

  const rawName =
    studentRow.name != null && String(studentRow.name).trim() !== ""
      ? String(studentRow.name).trim()
      : "";
  const displayName = rawName !== "" ? rawName : studentId;
  return {
    studentId,
    displayName,
    term: term.trim(),
    year,
    totalFees: 0,
  };
}

function augmentPayloadScheduleMeta(
  payload: StudentAccountPayload,
  args: {
    portalCurrentTerm: ReturnType<typeof buildAccountCurrentTerm> | null;
    availableScheduleTerms: AccountScheduleTermOption[];
  },
): StudentAccountPayload {
  const availableScheduleTerms = mergeScheduleTermOptionLists(
    args.availableScheduleTerms,
    payload.term,
    payload.year,
  );
  return {
    ...payload,
    currentTerm: args.portalCurrentTerm,
    availableScheduleTerms,
  };
}

async function getDemoStudentAccountPayload(
  studentId: string,
  termYear: AccountTermYearInput,
): Promise<StudentAccountPayload | null> {
  const listedPairs = await listPortalFinanceActivityTermsForStudent(
    pool,
    studentId,
  ).catch(() => [] as { term: string; year: number }[]);
  const listedOptions = toScheduleTermOptions(listedPairs);

  let term: string;
  let year: number;

  if (termYear.mode === "explicit") {
    term = termYear.term;
    year = termYear.year;
  } else {
    const latest = await findLatestTermYearForStudent(pool, studentId);
    if (!latest) {
      const catalog = getCatalogDemoAccountPayload("Fall", 2026);
      const portalCt = buildAccountCurrentTerm("Fall", 2026);
      return augmentPayloadScheduleMeta(catalog, {
        portalCurrentTerm: portalCt,
        availableScheduleTerms:
          listedOptions.length > 0
            ? listedOptions
            : [{ term: "Fall", year: 2026, label: portalCt.label }],
      });
    }
    term = latest.term;
    year = latest.year;
  }

  const latestForActive = await findLatestTermYearForStudent(pool, studentId);
  const portalCurrentTerm =
    latestForActive != null
      ? buildAccountCurrentTerm(latestForActive.term, latestForActive.year)
      : buildAccountCurrentTerm(term, year);

  console.debug(
    "[account-debug] getStudentAccountPayload (demo) input",
    JSON.stringify({ studentId, term, year, mode: termYear.mode }),
  );

  try {
    const ctx = await loadAccountContext(pool, studentId, term, year);
    if (ctx) {
      return assembleStudentAccountPayload(ctx, {
        portalCurrentTerm,
        availableScheduleTerms: mergeScheduleTermOptionLists(
          listedOptions,
          term,
          year,
        ),
      });
    }
  } catch (err) {
    console.warn(
      "[billing] MySQL error for demo-student — using catalog fallback:",
      (err as Error).message,
    );
  }
  const catalog = getCatalogDemoAccountPayload(term, year);
  return augmentPayloadScheduleMeta(catalog, {
    portalCurrentTerm,
    availableScheduleTerms: listedOptions,
  });
}

async function getRealStudentAccountPayload(
  studentId: string,
  termYear: AccountTermYearInput,
): Promise<StudentAccountPayload | null> {
  let term: string;
  let year: number;

  if (termYear.mode === "explicit") {
    term = termYear.term;
    year = termYear.year;
  } else {
    const [latestLegacy, latestPortal] = await Promise.all([
      findLatestLegacyTermYear(pool, studentId),
      findLatestPortalEnrollmentTermYear(studentId),
    ]);
    const latest = pickNewerRegistrationAnchor(latestLegacy, latestPortal);
    if (!latest) {
      console.debug(
        "[account-debug] getStudentAccountPayload: no legacy or portal registration for auto term",
        JSON.stringify({ studentId }),
      );
      return null;
    }
    term = latest.term;
    year = latest.year;
  }

  console.debug(
    "[account-debug] getStudentAccountPayload (legacy) input",
    JSON.stringify({ studentId, term, year, mode: termYear.mode }),
  );

  const [
    snap,
    listedPairs,
    portalEnrollmentRows,
    latestPortalTermYear,
    portalScheduleTermList,
    latestLegacyTermYear,
    allMarksRows,
  ] = await Promise.all([
    loadLegacyAccountSnapshot(pool, studentId, term, year),
    listLegacyRegistrationTermsForStudent(pool, studentId),
    listPortalEnrollmentRowsForStudentAcademics(studentId),
    findLatestPortalEnrollmentTermYear(studentId),
    listPortalFinanceActivityTermsForStudent(pool, studentId).catch(
      () => [] as { term: string; year: number }[],
    ),
    findLatestLegacyTermYear(pool, studentId),
    listMarksForStudent(pool, studentId),
  ]);

  const effectiveSnap = await resolveBrowseAccountSnapshot(
    snap,
    pool,
    studentId,
    term,
    year,
    termYear.mode,
    portalEnrollmentRows,
    allMarksRows,
  );
  if (!effectiveSnap) {
    return null;
  }

  const [accountingRows, courseLookup, clinicalProgress] = await Promise.all([
    loadLegacyAccountingRows(pool, studentId, effectiveSnap.term, effectiveSnap.year),
    loadCoursesTranscriptLookup(pool),
    buildClinicalProgress(pool, studentId),
  ]);

  const latestRegistration = pickNewerRegistrationAnchor(
    latestLegacyTermYear,
    latestPortalTermYear,
  );
  const portalActiveTerm =
    latestRegistration == null
      ? null
      : resolveActiveEnrollmentTerm(
          latestRegistration,
          allMarksRows,
          portalEnrollmentRows,
        );

  let availableScheduleTerms = toScheduleTermOptions(listedPairs);
  for (const p of portalScheduleTermList) {
    availableScheduleTerms = mergeScheduleTermOptionLists(
      availableScheduleTerms,
      p.term,
      p.year,
    );
  }
  availableScheduleTerms = mergeScheduleTermOptionLists(
    availableScheduleTerms,
    effectiveSnap.term,
    effectiveSnap.year,
  );
  availableScheduleTerms =
    await enrichScheduleTermsWithAcademicIds(availableScheduleTerms);

  const activePortalEnrollmentCountForBrowseTerm = portalEnrollmentRows.filter(
    (p) =>
      p.year === effectiveSnap.year &&
      termsMatch(p.term, effectiveSnap.term) &&
      p.status !== "withdrawn",
  ).length;

  let enrolledSectionsScheduleRows;
  if (activePortalEnrollmentCountForBrowseTerm > 0) {
    try {
      const { sections } = await listStudentEnrolledSectionsForTerm(
        studentId,
        effectiveSnap.term,
        effectiveSnap.year,
      );
      enrolledSectionsScheduleRows =
        courseSectionDetailsToAccountScheduleRows(sections);
    } catch (e) {
      console.warn(
        "[account] enrolled-sections schedule for browse term failed",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return assembleLegacyStudentAccountPayload(
    effectiveSnap,
    accountingRows,
    allMarksRows,
    courseLookup,
    {
      portalActiveTerm,
      availableScheduleTerms,
      clinicalProgress,
      portalEnrollmentRows,
      enrolledSectionsScheduleRows,
    },
  );
}

export async function getStudentAccountPayload(
  studentId: string,
  termYear: AccountTermYearInput,
): Promise<StudentAccountPayload | null> {
  if (studentId === DEMO_STUDENT_ID) {
    return getDemoStudentAccountPayload(studentId, termYear);
  }
  return getRealStudentAccountPayload(studentId, termYear);
}
