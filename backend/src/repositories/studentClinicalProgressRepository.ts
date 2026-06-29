import { type Pool, type RowDataPacket } from "../lib/db.js";
/**
 * Clinical progress rows for student/admin clinical progress tabs.
 * Source of truth is merged legacy `clinic` + newer `clinical_assignments`.
 */


export type StudentClinicalProgressRecord = {
  code: string;
  courseTitle: string;
  term: string;
  year: number;
  grade: string;
  hours: number;
};

export type StudentClinicalExamHistoryItem = {
  code: string;
  examName: string;
  status: string;
  grade: string | null;
  term: string | null;
  year: number | null;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function numHours(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function optionalYearNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type MarksExamRow = {
  code: string;
  status: string;
  term: string | null;
  year: number | null;
};

function lower(v: unknown): string {
  return str(v).toLowerCase();
}

function termLabel(termRaw: unknown, yearRaw: unknown): { term: string; year: number } {
  const term = str(termRaw);
  const year = optionalYearNum(yearRaw);
  if (term !== "" && year != null) {
    const normalized = `${term.charAt(0).toUpperCase()}${term.slice(1).toLowerCase()}`;
    return { term: normalized, year };
  }
  return { term: "", year: 0 };
}

function normalizeExamSignal(v: unknown): MarksExamRow {
  const raw = str(v);
  if (raw === "") {
    return { code: "", status: "Not Taken", term: null, year: null };
  }
  const upper = raw.toUpperCase();
  if (upper === "P") {
    return { code: "P", status: "Passed", term: null, year: null };
  }
  if (upper === "F") {
    return { code: "F", status: "Failed", term: null, year: null };
  }
  return { code: raw, status: raw, term: null, year: null };
}

function shouldCountCompletedStatus(statusRaw: unknown): boolean {
  const s = lower(statusRaw);
  return s === "completed" || s === "done";
}

function dedupeKey(
  codeRaw: unknown,
  termRaw: unknown,
  yearRaw: unknown,
  timetableRaw?: unknown,
): string {
  const code = str(codeRaw).toUpperCase();
  const term = str(termRaw).toUpperCase();
  const year = optionalYearNum(yearRaw);
  const timetableId = Number(timetableRaw);
  const timetablePart = Number.isFinite(timetableId) && timetableId > 0 ? String(Math.trunc(timetableId)) : "";
  return [code, term, year == null ? "" : String(year), timetablePart].join("|");
}

/**
 * Clinical progress for student/admin tabs using `clinical_assignments` as the primary source.
 */
export async function loadStudentClinicalProgressFromClinic(
  pool: Pool,
  requestedStudentId: string,
): Promise<{
  completedCount: number;
  totalHours: number;
  records: StudentClinicalProgressRecord[];
  exams: StudentClinicalExamHistoryItem[];
}> {
  const requested = requestedStudentId.trim();
  const [studentRows] = await pool.query<RowDataPacket[]>(
    `SELECT seqNum,
            id,
            name,
            exam,
            level1exam,
            level2exam,
            level3exam
       FROM students
      WHERE TRIM(id) = TRIM(?)
         OR CAST(seqNum AS CHAR) = TRIM(?)
         OR TRIM(CAST(seqNum AS CHAR)) = REPLACE(TRIM(?), 'C', '')
      LIMIT 1`,
    [requested, requested, requested],
  );
  const student = (studentRows[0] ?? null) as Record<string, unknown> | null;
  if (student == null) {
    console.log("[clinical-progress] student not resolved", {
      requestedStudentId,
    });
    return { completedCount: 0, totalHours: 0, records: [], exams: [] };
  }

  const resolvedStudentCode = str(student.id);

  const [legacyClinicRowsResult, assignmentRowsResult] =
    await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT seqNumber,
                code,
                course_title,
                term,
                year,
                hours,
                grade,
                grade2,
                days,
                time_from,
                time_to,
                instructor
           FROM clinic
          WHERE TRIM(id) = TRIM(?)
          ORDER BY year DESC, term DESC, code ASC`,
        [resolvedStudentCode],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT
            id,
            course_code,
            session_date,
            session_name,
            term,
            year,
            status,
            timetable_id
         FROM clinical_assignments
         WHERE TRIM(student_id) = TRIM(?)
           AND LOWER(status) NOT IN ('dropped', 'cancelled')
         ORDER BY session_date DESC, created_at DESC`,
        [resolvedStudentCode],
      ),
    ]);

  const legacyClinicRows = legacyClinicRowsResult[0] as RowDataPacket[];
  const assignmentRows = assignmentRowsResult[0] as RowDataPacket[];
  const assignmentTimetableIds = Array.from(
    new Set(
      assignmentRows
        .map((r) => Number((r as Record<string, unknown>).timetable_id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((id) => Math.trunc(id)),
    ),
  );
  const derivedHoursByTimetableId = new Map<number, number>();
  if (assignmentTimetableIds.length > 0) {
    const placeholders = assignmentTimetableIds.map(() => "?").join(",");
    const [timetableRows] = await pool.query<RowDataPacket[]>(
      `SELECT seqNum, time_from, time_to
         FROM clinic_timetable
        WHERE seqNum IN (${placeholders})`,
      assignmentTimetableIds,
    );
    for (const r of timetableRows) {
      const row = r as Record<string, unknown>;
      const seqNum = Number(row.seqNum);
      if (!Number.isFinite(seqNum) || seqNum <= 0) continue;
      const timeFrom = str(row.time_from);
      const timeTo = str(row.time_to);
      const timeMatchFrom = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(timeFrom);
      const timeMatchTo = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(timeTo);
      if (!timeMatchFrom || !timeMatchTo) continue;
      const fromMinutes = Number(timeMatchFrom[1]) * 60 + Number(timeMatchFrom[2]);
      const toMinutes = Number(timeMatchTo[1]) * 60 + Number(timeMatchTo[2]);
      const durationHours = Math.max(0, (toMinutes - fromMinutes) / 60);
      derivedHoursByTimetableId.set(Math.trunc(seqNum), durationHours);
    }
  }

  console.log("[clinical-progress] requested/resolved", {
    requestedStudentId,
    resolvedSeqNum: Number(student.seqNum),
    resolvedStudentCode: student.id,
    studentName: student.name,
  });

  const records: StudentClinicalProgressRecord[] = [];
  const seen = new Set<string>();
  let assignmentCompletedCount = 0;
  let legacyHoursSum = 0;
  let assignmentDerivedHoursSum = 0;

  for (const r of legacyClinicRows) {
    const row = r as Record<string, unknown>;
    const label = termLabel(row.term, row.year);
    const key = dedupeKey(row.code, label.term, label.year);
    seen.add(key);
    records.push({
      code: str(row.code),
      courseTitle: str(row.course_title),
      term: label.term,
      year: label.year,
      grade: str(row.grade) || str(row.grade2) || "Completed",
      hours: numHours(row.hours),
    });
    legacyHoursSum += numHours(row.hours);
  }

  for (const r of assignmentRows) {
    const row = r as Record<string, unknown>;
    const label = termLabel(row.term, row.year);
    const code = str(row.course_code);
    const byCodeTermYear = dedupeKey(code, label.term, label.year);
    const byCodeTermYearTimetable = dedupeKey(code, label.term, label.year, row.timetable_id);
    if (seen.has(byCodeTermYear) || seen.has(byCodeTermYearTimetable)) {
      continue;
    }
    seen.add(byCodeTermYear);
    seen.add(byCodeTermYearTimetable);
    const timetableId = Number(row.timetable_id);
    const derivedHours = Number.isFinite(timetableId)
      ? numHours(derivedHoursByTimetableId.get(Math.trunc(timetableId)))
      : 0;
    records.push({
      code: code || str(row.timetable_id) || str(row.id),
      courseTitle: str(row.session_name),
      term: label.term,
      year: label.year,
      grade: str(row.status),
      hours: derivedHours,
    });
    if (shouldCountCompletedStatus(row.status)) {
      assignmentCompletedCount += 1;
      assignmentDerivedHoursSum += derivedHours;
    }
  }

  const examsDefinition: Array<{
    code: string;
    examName: string;
    signal: MarksExamRow;
  }> = [
    {
      code: "CL100",
      examName: "Clinic Entrance Exam",
      signal: normalizeExamSignal(student.exam),
    },
    {
      code: "CL120",
      examName: "Clinic Practical Exam",
      signal: normalizeExamSignal(student.level1exam),
    },
    {
      code: "CL200",
      examName: "Clinic Level II Exit Exam",
      signal: normalizeExamSignal(student.level2exam),
    },
    {
      code: "CL300",
      examName: "Clinic Level III Exit Exam",
      signal: normalizeExamSignal(student.level3exam),
    },
  ];

  const exams: StudentClinicalExamHistoryItem[] = examsDefinition.map((exam) => {
    const legacy = exam.signal;
    const grade = legacy.status === "Not Taken" ? "-" : legacy.code;
    return {
      code: exam.code,
      examName: exam.examName,
      status: legacy.status,
      grade,
      term: legacy.term,
      year: legacy.year,
    };
  });

  const legacyCompletedCount = legacyClinicRows.length;
  const completedCount = legacyCompletedCount + assignmentCompletedCount;
  const totalHours = legacyHoursSum + assignmentDerivedHoursSum;

  console.log("[clinical-progress] source counts", {
    legacyClinicRowCount: legacyClinicRows.length,
    clinicalAssignmentRowCount: assignmentRows.length,
    completedCount,
    totalHours,
    examFields: {
      exam: student.exam,
      level1exam: student.level1exam,
      level2exam: student.level2exam,
      level3exam: student.level3exam,
    },
  });

  return {
    completedCount,
    totalHours,
    records,
    exams,
  };
}
