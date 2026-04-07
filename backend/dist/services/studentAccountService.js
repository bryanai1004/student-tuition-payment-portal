import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { listMarksForStudent } from "../repositories/studentAcademicsRepository.js";
import { findLatestLegacyTermYear, listLegacyRegistrationTermsForStudent, loadLegacyAccountSnapshot, loadLegacyAccountingRows, } from "../repositories/studentLegacyAccountRepository.js";
import { findLatestTermYearForStudent, listPortalScheduleTermsForStudent, loadAccountContext, } from "../repositories/studentAccountRepository.js";
import { loadCoursesTranscriptLookup } from "../repositories/studentTranscriptRepository.js";
import { getCatalogDemoAccountPayload } from "./demoAccountService.js";
import { resolveRegistrationAnchoredAcademicTerm, termSortOrder, } from "./studentAcademicCourseRecords.js";
import { buildClinicalProgress } from "./clinicalProgressService.js";
import { assembleLegacyStudentAccountPayload } from "./studentLegacyAccountAssembler.js";
import { buildAccountCurrentTerm } from "./studentAccountDashboard.js";
import { assembleStudentAccountPayload } from "./studentAccountAssembler.js";
function toScheduleTermOptions(pairs) {
    return pairs.map(({ term, year }) => {
        const ct = buildAccountCurrentTerm(term, year);
        return { term, year, label: ct.label };
    });
}
function mergeScheduleTermOptionLists(primary, browseTerm, browseYear) {
    const byKey = new Map();
    for (const o of primary) {
        byKey.set(`${o.term.toLowerCase()}|${o.year}`, o);
    }
    const bKey = `${browseTerm.toLowerCase()}|${browseYear}`;
    if (!byKey.has(bKey)) {
        const ct = buildAccountCurrentTerm(browseTerm, browseYear);
        byKey.set(bKey, { term: browseTerm, year: browseYear, label: ct.label });
    }
    return [...byKey.values()].sort((a, b) => {
        if (b.year !== a.year)
            return b.year - a.year;
        return termSortOrder(b.term) - termSortOrder(a.term);
    });
}
function augmentPayloadScheduleMeta(payload, args) {
    const availableScheduleTerms = mergeScheduleTermOptionLists(args.availableScheduleTerms, payload.term, payload.year);
    return {
        ...payload,
        currentTerm: args.portalCurrentTerm,
        availableScheduleTerms,
    };
}
async function getDemoStudentAccountPayload(studentId, termYear) {
    const listedPairs = await listPortalScheduleTermsForStudent(pool, studentId).catch(() => []);
    const listedOptions = toScheduleTermOptions(listedPairs);
    let term;
    let year;
    if (termYear.mode === "explicit") {
        term = termYear.term;
        year = termYear.year;
    }
    else {
        const latest = await findLatestTermYearForStudent(pool, studentId);
        if (!latest) {
            const catalog = getCatalogDemoAccountPayload("Fall", 2026);
            const portalCt = buildAccountCurrentTerm("Fall", 2026);
            return augmentPayloadScheduleMeta(catalog, {
                portalCurrentTerm: portalCt,
                availableScheduleTerms: listedOptions.length > 0
                    ? listedOptions
                    : [{ term: "Fall", year: 2026, label: portalCt.label }],
            });
        }
        term = latest.term;
        year = latest.year;
    }
    const latestForActive = await findLatestTermYearForStudent(pool, studentId);
    const portalCurrentTerm = latestForActive != null
        ? buildAccountCurrentTerm(latestForActive.term, latestForActive.year)
        : buildAccountCurrentTerm(term, year);
    console.debug("[account-debug] getStudentAccountPayload (demo) input", JSON.stringify({ studentId, term, year, mode: termYear.mode }));
    try {
        const ctx = await loadAccountContext(pool, studentId, term, year);
        if (ctx) {
            return assembleStudentAccountPayload(ctx, {
                portalCurrentTerm,
                availableScheduleTerms: mergeScheduleTermOptionLists(listedOptions, term, year),
            });
        }
    }
    catch (err) {
        console.warn("[billing] MySQL error for demo-student — using catalog fallback:", err.message);
    }
    const catalog = getCatalogDemoAccountPayload(term, year);
    return augmentPayloadScheduleMeta(catalog, {
        portalCurrentTerm,
        availableScheduleTerms: listedOptions,
    });
}
async function getRealStudentAccountPayload(studentId, termYear) {
    let term;
    let year;
    if (termYear.mode === "explicit") {
        term = termYear.term;
        year = termYear.year;
    }
    else {
        const latest = await findLatestLegacyTermYear(pool, studentId);
        if (!latest) {
            console.debug("[account-debug] getStudentAccountPayload: no legacy registration for auto term", JSON.stringify({ studentId }));
            return null;
        }
        term = latest.term;
        year = latest.year;
    }
    console.debug("[account-debug] getStudentAccountPayload (legacy) input", JSON.stringify({ studentId, term, year, mode: termYear.mode }));
    const [snap, listedPairs] = await Promise.all([
        loadLegacyAccountSnapshot(pool, studentId, term, year),
        listLegacyRegistrationTermsForStudent(pool, studentId),
    ]);
    if (!snap) {
        return null;
    }
    const [accountingRows, allMarksRows, courseLookup, latestReg, clinicalProgress] = await Promise.all([
        loadLegacyAccountingRows(pool, studentId, term, year),
        listMarksForStudent(pool, studentId),
        loadCoursesTranscriptLookup(pool),
        findLatestLegacyTermYear(pool, studentId),
        buildClinicalProgress(pool, studentId),
    ]);
    let portalActiveTerm = null;
    if (latestReg != null) {
        const anchor = resolveRegistrationAnchoredAcademicTerm(latestReg, allMarksRows);
        if (anchor != null) {
            portalActiveTerm = { term: anchor.term, year: anchor.year };
        }
    }
    const availableScheduleTerms = mergeScheduleTermOptionLists(toScheduleTermOptions(listedPairs), snap.term, snap.year);
    return assembleLegacyStudentAccountPayload(snap, accountingRows, allMarksRows, courseLookup, { portalActiveTerm, availableScheduleTerms, clinicalProgress });
}
export async function getStudentAccountPayload(studentId, termYear) {
    if (studentId === DEMO_STUDENT_ID) {
        return getDemoStudentAccountPayload(studentId, termYear);
    }
    return getRealStudentAccountPayload(studentId, termYear);
}
//# sourceMappingURL=studentAccountService.js.map