import { selectCourseNamesByCode, selectDistinctMarksInstructorsForCourse, selectDistinctTimetableInstructorIdsForCourse, selectInstructorDisplayNameByInstructorId, } from "../repositories/adminCourseMetaRepository.js";
function titleFromCourseRow(row, courseCode) {
    if (row != null) {
        if (row.chi_name.trim() !== "")
            return row.chi_name.trim();
        if (row.eng_name.trim() !== "")
            return row.eng_name.trim();
    }
    return courseCode;
}
/**
 * Admin course-section helper: authoritative Chinese-first title from `courses`, and a single
 * high-confidence instructor suggestion from legacy timetables or marks (never ambiguous).
 */
export async function resolveCourseMeta(courseCodeRaw) {
    const course_code = courseCodeRaw.trim();
    if (course_code === "")
        return null;
    const courseRow = await selectCourseNamesByCode(course_code);
    const title = titleFromCourseRow(courseRow, course_code);
    const timetableIds = await selectDistinctTimetableInstructorIdsForCourse(course_code);
    if (timetableIds.length === 1) {
        const display = await selectInstructorDisplayNameByInstructorId(timetableIds[0]);
        if (display != null && display.trim() !== "") {
            return { title, suggestedInstructor: display.trim() };
        }
    }
    const marksNames = await selectDistinctMarksInstructorsForCourse(course_code);
    if (marksNames.length === 1) {
        return { title, suggestedInstructor: marksNames[0].trim() };
    }
    return { title, suggestedInstructor: null };
}
//# sourceMappingURL=resolveCourseMetaService.js.map