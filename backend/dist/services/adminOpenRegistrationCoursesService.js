import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { listCoursesFromMysql } from "../repositories/courseRepository.js";
import { countCourseSectionsByCourseForTermYear, listPortalEnrollmentRollupsByCourseForTermYear, } from "../repositories/courseSectionRepository.js";
function catalogKey(code) {
    return code.trim().toUpperCase();
}
function titleFromCatalog(code, row) {
    if (!row)
        return code.trim();
    const eng = row.eng_name;
    if (typeof eng === "string" && eng.trim() !== "")
        return eng.trim();
    const chi = row.chi_name;
    if (typeof chi === "string" && chi.trim() !== "")
        return chi.trim();
    return code.trim();
}
function creditsFromCatalog(row) {
    if (!row)
        return 0;
    const u = row.units;
    if (typeof u === "number" && Number.isFinite(u))
        return u;
    if (typeof u === "string") {
        const n = Number(u.trim());
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}
function categoryFromCatalog(row) {
    if (!row)
        return "—";
    const c = row.category;
    if (c == null)
        return "—";
    const s = String(c).trim();
    return s === "" ? "—" : s;
}
/**
 * Admin rollup: courses that have at least one section scheduled in the given academic term.
 *
 * Assumption: `course_sections` has no per-section “open for registration” flag. Each row
 * represents a scheduled offering; we count those rows per course. Whether registration is
 * active for the term is taken from `academic_terms.status === 'registration_open'`
 * (mirrors student “current registration term” behavior).
 */
export async function listAdminOpenRegistrationCourses(academicTermId) {
    const term = await getAcademicTermById(academicTermId.trim());
    if (!term)
        return null;
    const [counts, enrollmentRollups] = await Promise.all([
        countCourseSectionsByCourseForTermYear(term.term_name, term.year),
        listPortalEnrollmentRollupsByCourseForTermYear(term.term_name, term.year),
    ]);
    if (counts.length === 0)
        return [];
    const enrollmentByCode = new Map();
    for (const r of enrollmentRollups) {
        enrollmentByCode.set(catalogKey(r.course_code), r);
    }
    const catalog = await listCoursesFromMysql();
    const byCode = new Map();
    for (const c of catalog) {
        const code = String(c.code ?? "").trim();
        if (code === "")
            continue;
        byCode.set(catalogKey(code), c);
    }
    const registrationStatus = term.status === "registration_open" ? "Open" : "Closed";
    const out = [];
    for (const { course_code, section_count } of counts) {
        const code = course_code.trim();
        if (code === "" || section_count <= 0)
            continue;
        const cat = byCode.get(catalogKey(code));
        const en = enrollmentByCode.get(catalogKey(code));
        const enrolledCount = en?.enrolled_count ?? 0;
        out.push({
            courseCode: code,
            courseTitle: titleFromCatalog(code, cat),
            credits: creditsFromCatalog(cat),
            category: categoryFromCatalog(cat),
            termId: term.id,
            termLabel: term.term_label,
            openSections: section_count,
            enrolledCount,
            ...(en?.enrolled_students != null && en.enrolled_students.length > 0
                ? { enrolledStudents: en.enrolled_students }
                : {}),
            registrationStatus,
        });
    }
    out.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
    return out;
}
//# sourceMappingURL=adminOpenRegistrationCoursesService.js.map