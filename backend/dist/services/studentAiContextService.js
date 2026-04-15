import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import { getLegacyStudentProfile } from "./studentProfileService.js";
function formatCourseLine(courseCode, courseTitle, suffix) {
    const code = courseCode.trim();
    const title = courseTitle.trim();
    const base = code && title ? `${code} - ${title}` : code || title || "Unknown course";
    const extra = suffix?.trim() ?? "";
    return extra ? `${base} (${extra})` : base;
}
function pushField(lines, label, value) {
    if (value == null || value.trim() === "") {
        lines.push(`- ${label}: Unavailable`);
        return;
    }
    lines.push(`- ${label}: ${value.trim()}`);
}
export async function buildStudentAiContext(studentId) {
    const trimmedStudentId = studentId.trim();
    const [profile, academics] = await Promise.all([
        getLegacyStudentProfile(trimmedStudentId),
        getStudentAcademicsPayload(trimmedStudentId),
    ]);
    const name = profile?.fullName?.trim() ||
        academics.studentName?.trim() ||
        trimmedStudentId;
    const program = profile?.program?.trim() ?? null;
    const track = profile?.track?.trim() ?? null;
    const currentTermLabel = academics.currentTerm == null
        ? null
        : `${academics.currentTerm.term} ${academics.currentTerm.year}`;
    const currentEnrollments = academics.currentSchedule.slice(0, 12).map((item) => {
        const details = [];
        if (item.status && item.status !== "active")
            details.push(`status: ${item.status}`);
        if (item.instructor)
            details.push(`instructor: ${item.instructor}`);
        return formatCourseLine(item.courseCode, item.courseTitle, details.join(", "));
    });
    const recentHistory = academics.enrollmentHistory.slice(0, 10).map((item) => {
        const details = [`${item.term} ${item.year}`];
        if (item.status)
            details.push(`status: ${item.status}`);
        if (item.grade)
            details.push(`grade: ${item.grade}`);
        return formatCourseLine(item.courseCode, item.courseTitle, details.join(", "));
    });
    const completedCourses = academics.transcript
        .filter((item) => item.grade != null && item.grade.trim() !== "")
        .slice(0, 12)
        .map((item) => formatCourseLine(item.courseCode, item.courseTitle, `${item.grade}${item.term && item.year ? `, ${item.term} ${item.year}` : ""}`));
    const notes = [];
    if (academics.currentTerm == null) {
        notes.push("Current term is unavailable in the student record.");
    }
    if (currentEnrollments.length === 0) {
        notes.push("No active enrollments were found for the current term.");
    }
    if (completedCourses.length === 0) {
        notes.push("No completed-course grade data is available in the current transcript snapshot.");
    }
    if (profile == null) {
        notes.push("Program / track profile details were not available from the student profile record.");
    }
    const lines = ["Student Context"];
    pushField(lines, "Student ID", trimmedStudentId);
    pushField(lines, "Name", name);
    pushField(lines, "Program", program);
    pushField(lines, "Track", track);
    pushField(lines, "Current Term", currentTermLabel);
    lines.push("- Current Enrollments:");
    if (currentEnrollments.length === 0) {
        lines.push("  - None found");
    }
    else {
        for (const item of currentEnrollments)
            lines.push(`  - ${item}`);
    }
    lines.push("- Recent Registration History:");
    if (recentHistory.length === 0) {
        lines.push("  - No recent registration history found");
    }
    else {
        for (const item of recentHistory)
            lines.push(`  - ${item}`);
    }
    lines.push("- Recent / Completed Courses and Grades:");
    if (completedCourses.length === 0) {
        lines.push("  - Grade data unavailable");
    }
    else {
        for (const item of completedCourses)
            lines.push(`  - ${item}`);
    }
    lines.push("- Notes:");
    if (notes.length === 0) {
        lines.push("  - No major data gaps detected in the current student snapshot");
    }
    else {
        for (const note of notes)
            lines.push(`  - ${note}`);
    }
    const dataSources = [
        "students",
        "marks",
        "portal_enrollments",
        "portal_courses",
    ];
    return {
        studentId: trimmedStudentId,
        contextText: lines.join("\n"),
        dataSources,
        meta: {
            hasProfile: profile != null,
            hasCurrentTerm: academics.currentTerm != null,
            currentEnrollmentCount: currentEnrollments.length,
            recentHistoryCount: recentHistory.length,
            completedGradeCount: completedCourses.length,
            notesCount: notes.length,
        },
    };
}
//# sourceMappingURL=studentAiContextService.js.map