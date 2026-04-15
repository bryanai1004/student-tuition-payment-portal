import { getGraduationRequirementsForProgram } from "../config/graduationRequirements.js";
import { getStudentAcademicsPayload } from "./studentAcademicsService.js";
import { termSortOrder } from "./studentAcademicCourseRecords.js";
import { getLegacyStudentProfile } from "./studentProfileService.js";
function normalizeCourseCode(courseCode) {
    return courseCode.replace(/[\s-]+/g, "").trim().toUpperCase();
}
function roundTwo(value) {
    return Math.round(value * 100) / 100;
}
function normalizedLetterGrade(grade) {
    const value = grade?.trim();
    return value ? value.toUpperCase() : null;
}
function isCompletedMarksAttempt(record) {
    return record.source === "marks" && record.status === "completed";
}
function compareAttemptsDesc(a, b) {
    if (b.year !== a.year)
        return b.year - a.year;
    const termDiff = termSortOrder(b.term) - termSortOrder(a.term);
    if (termDiff !== 0)
        return termDiff;
    const aNumeric = a.numericGrade ?? Number.NEGATIVE_INFINITY;
    const bNumeric = b.numericGrade ?? Number.NEGATIVE_INFINITY;
    return bNumeric - aNumeric;
}
function pickLatestCompletedAttempts(records) {
    const completedAttempts = records.filter(isCompletedMarksAttempt).sort(compareAttemptsDesc);
    const byCourseCode = new Map();
    for (const attempt of completedAttempts) {
        const courseCode = normalizeCourseCode(attempt.courseCode);
        if (!byCourseCode.has(courseCode)) {
            byCourseCode.set(courseCode, attempt);
        }
    }
    return byCourseCode;
}
function safeNonNegativeNumber(value) {
    return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}
function countEarnedCredits(attempts) {
    let total = 0;
    for (const attempt of attempts) {
        if (attempt.credits != null && Number.isFinite(attempt.credits)) {
            total += attempt.credits;
        }
    }
    return roundTwo(total);
}
function computeCumulativeGpa(attempts) {
    const excludedGrades = new Set(["P", "W", "AUD", "T"]);
    let gradePoints = 0;
    let gpaEligibleUnits = 0;
    for (const attempt of attempts) {
        const grade = normalizedLetterGrade(attempt.grade);
        const credits = attempt.credits;
        const numericGrade = attempt.numericGrade;
        if (credits == null ||
            !Number.isFinite(credits) ||
            numericGrade == null ||
            !Number.isFinite(numericGrade)) {
            continue;
        }
        if (grade != null && excludedGrades.has(grade))
            continue;
        gradePoints += numericGrade * credits;
        gpaEligibleUnits += credits;
    }
    if (gpaEligibleUnits <= 0)
        return null;
    return roundTwo(gradePoints / gpaEligibleUnits);
}
function countWithdrawals(records) {
    const seen = new Set();
    let count = 0;
    for (const record of records) {
        if (record.status !== "withdrawn")
            continue;
        const key = [
            normalizeCourseCode(record.courseCode),
            record.term.trim().toLowerCase(),
            String(record.year),
            record.source,
        ].join("|");
        if (seen.has(key))
            continue;
        seen.add(key);
        count += 1;
    }
    return count;
}
export function evaluateGraduation(studentRecord) {
    const requirements = getGraduationRequirementsForProgram(studentRecord.profile?.program);
    const latestCompletedAttempts = pickLatestCompletedAttempts(studentRecord.courseRecords);
    const completedCourseCodes = new Set(latestCompletedAttempts.keys());
    const transferCredits = safeNonNegativeNumber(studentRecord.profile?.credits);
    const transcriptCredits = countEarnedCredits(latestCompletedAttempts.values());
    const totalCredits = roundTwo(transcriptCredits + transferCredits);
    const requiredCredits = requirements.totalCreditsRequired;
    const missingCredits = Math.max(roundTwo(requiredCredits - totalCredits), 0);
    const missingCourses = requirements.requiredCourses.filter((courseCode) => !completedCourseCodes.has(normalizeCourseCode(courseCode)));
    const completedRequiredCourses = requirements.requiredCourses.filter((courseCode) => completedCourseCodes.has(normalizeCourseCode(courseCode)));
    const cumulativeGpa = computeCumulativeGpa(latestCompletedAttempts.values());
    const requiredGpa = requirements.minimumGpa;
    const missingGpa = requiredGpa != null && cumulativeGpa != null && cumulativeGpa < requiredGpa
        ? roundTwo(requiredGpa - cumulativeGpa)
        : requiredGpa != null && cumulativeGpa == null
            ? requiredGpa
            : null;
    const withdrawalCount = countWithdrawals(studentRecord.courseRecords);
    const meetsCredits = missingCredits <= 0;
    const meetsCourses = missingCourses.length === 0;
    const meetsGpa = requiredGpa == null || (cumulativeGpa != null && cumulativeGpa >= requiredGpa);
    const meetsWithdrawals = requirements.maximumWithdrawals == null ||
        withdrawalCount <= requirements.maximumWithdrawals;
    const notes = [...requirements.notes];
    if (transferCredits > 0) {
        notes.push(`Transfer / admission credits included: ${transferCredits}.`);
    }
    if (requiredGpa != null && cumulativeGpa == null) {
        notes.push("A GPA requirement is configured, but no GPA-eligible transcript rows were found.");
    }
    return {
        eligible: meetsCredits && meetsCourses && meetsGpa && meetsWithdrawals,
        program: studentRecord.profile?.program ?? null,
        track: studentRecord.profile?.track ?? null,
        ruleSetId: requirements.ruleSetId,
        ruleSetSource: requirements.sourceLabel,
        earnedCredits: totalCredits,
        totalCredits,
        transcriptCredits,
        transferCredits,
        requiredCredits,
        missingCredits,
        completedRequiredCourses,
        missingCourses,
        cumulativeGpa,
        requiredGpa,
        missingGpa,
        withdrawalCount,
        maximumWithdrawals: requirements.maximumWithdrawals,
        notes,
    };
}
export async function evaluateStudentGraduation(studentId) {
    const trimmedStudentId = studentId.trim();
    const [profile, academics] = await Promise.all([
        getLegacyStudentProfile(trimmedStudentId),
        getStudentAcademicsPayload(trimmedStudentId),
    ]);
    return evaluateGraduation({
        profile,
        courseRecords: academics.courseRecords,
    });
}
export function formatGraduationEvaluationFacts(evaluation) {
    const lines = ["Structured Graduation Evaluation"];
    lines.push(`- Eligible: ${evaluation.eligible ? "Yes" : "No"}`);
    lines.push(`- Program: ${evaluation.program ?? "Unavailable"}`);
    lines.push(`- Track: ${evaluation.track ?? "Unavailable"}`);
    lines.push(`- Rule set ID: ${evaluation.ruleSetId}`);
    lines.push(`- Rule set source: ${evaluation.ruleSetSource}`);
    lines.push(`- Earned credits: ${evaluation.earnedCredits}`);
    lines.push(`- Transcript credits: ${evaluation.transcriptCredits}`);
    lines.push(`- Transfer / admission credits counted: ${evaluation.transferCredits}`);
    lines.push(`- Required credits: ${evaluation.requiredCredits}`);
    lines.push(`- Missing credits: ${evaluation.missingCredits}`);
    lines.push(`- Completed required courses: ${evaluation.completedRequiredCourses.length > 0 ? evaluation.completedRequiredCourses.join("; ") : "None recorded"}`);
    lines.push(`- Missing required courses: ${evaluation.missingCourses.length > 0 ? evaluation.missingCourses.join("; ") : "None"}`);
    lines.push(`- Cumulative GPA: ${evaluation.cumulativeGpa != null ? evaluation.cumulativeGpa : "Unavailable"}`);
    lines.push(`- Required GPA: ${evaluation.requiredGpa != null ? evaluation.requiredGpa : "Not configured"}`);
    lines.push(`- Missing GPA: ${evaluation.missingGpa != null ? evaluation.missingGpa : "None"}`);
    lines.push(`- Withdrawal count: ${evaluation.withdrawalCount}`);
    lines.push(`- Maximum withdrawals allowed: ${evaluation.maximumWithdrawals != null ? evaluation.maximumWithdrawals : "Not configured"}`);
    lines.push("- Notes:");
    if (evaluation.notes.length === 0) {
        lines.push("  - None");
    }
    else {
        for (const note of evaluation.notes) {
            lines.push(`  - ${note}`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=graduationEvaluationService.js.map