/**
 * Clinical progress rows for student/admin clinical progress tabs.
 * Source of truth is merged legacy `clinic` + newer `clinical_assignments`.
 */

import type { Pool, RowDataPacket } from "mysql2/promise";

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

type ClinicalExamRequestRow = {
  examCode: string;
  examName: string;
  status: string;
  term: string | null;
  year: number | null;
  createdAt: Date | string | null;
};

function lower(v: unknown): string {
  return str(v).toLowerCase();
}

function formatTermYear(termRaw: unknown, yearRaw: unknown): {
  term: string | null;
  year: number | null;
} {
  const term = str(termRaw);
  const year = optionalYearNum(yearRaw);
  return { term: term === "" ? null : term, year };
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
  studentRouteParam: string,
): Promise<{
  completedCount: number;
  totalHours: number;
  records: StudentClinicalProgressRecord[];
  exams: StudentClinicalExamHistoryItem[];
}> {
  const requested = studentRouteParam.trim();
  const [studentRows] = await pool.query<RowDataPacket[]>(
    `SELECT seqNum AS student_seq_num,
            TRIM(id) AS student_id,
            TRIM(name) AS student_name,
            exam,
            level1exam,
            level2exam,
            level3exam
       FROM students
      WHERE CAST(seqNum AS CHAR) = TRIM(?)
         OR TRIM(id) = TRIM(?)
      ORDER BY CASE WHEN TRIM(id) = TRIM(?) THEN 0 ELSE 1 END
      LIMIT 1`,
    [requested, requested, requested],
  );
  const student = (studentRows[0] ?? null) as Record<string, unknown> | null;
  if (student == null) {
    return { completedCount: 0, totalHours: 0, records: [], exams: [] };
  }

  const resolvedStudentId = str(student.student_id);
  const resolvedSeqNum = Number(student.student_seq_num);
  const examRaw = str(student.exam);
  const level1ExamRaw = str(student.level1exam);
  const level2ExamRaw = str(student.level2exam);
  const level3ExamRaw = str(student.level3exam);

  const [legacyClinicRowsResult, assignmentRowsResult, examRequestRowsResult] =
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
        [resolvedStudentId],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT ca.id,
                ca.course_code,
                ca.session_date,
                ca.session_name,
                ca.term,
                ca.year,
                ca.status,
                ca.timetable_id,
                ca.created_at,
                CASE
                  WHEN ca.session_date = '1900-01-01' THEN NULL
                  WHEN ca.timetable_id IS NULL THEN NULL
                  WHEN ct.time_from IS NULL OR ct.time_to IS NULL THEN NULL
                  ELSE GREATEST(
                    0,
                    TIMESTAMPDIFF(MINUTE, ct.time_from, ct.time_to) / 60
                  )
                END AS derived_hours
           FROM clinical_assignments ca
           LEFT JOIN clinic_timetable ct
             ON ca.timetable_id = ct.seqNum
          WHERE TRIM(ca.student_id) = TRIM(?)
            AND LOWER(TRIM(COALESCE(ca.status, ''))) NOT IN ('dropped', 'cancelled')
          ORDER BY ca.session_date DESC, ca.created_at DESC`,
        [resolvedStudentId],
      ),
      pool.query<RowDataPacket[]>(
        `SELECT exam_code,
                exam_name,
                status,
                term,
                year,
                created_at
           FROM clinical_exam_requests
          WHERE TRIM(student_id) = TRIM(?)
          ORDER BY created_at DESC`,
        [resolvedStudentId],
      ),
    ]);

  const legacyClinicRows = legacyClinicRowsResult[0] as RowDataPacket[];
  const assignmentRows = assignmentRowsResult[0] as RowDataPacket[];
  const records: StudentClinicalProgressRecord[] = [];
  const seen = new Set<string>();
  let dedupedAssignmentCompletedCount = 0;

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
    records.push({
      code: code || str(row.timetable_id) || str(row.id),
      courseTitle: str(row.session_name),
      term: label.term,
      year: label.year,
      grade: str(row.status),
      hours: numHours(row.derived_hours),
    });
    if (shouldCountCompletedStatus(row.status)) {
      dedupedAssignmentCompletedCount += 1;
    }
  }

  const examRequestRows: ClinicalExamRequestRow[] = (
    examRequestRowsResult[0] as RowDataPacket[]
  ).map((r) => {
    const row = r as Record<string, unknown>;
    const termYear = formatTermYear(row.term, row.year);
    return {
      examCode: str(row.exam_code),
      examName: str(row.exam_name),
      status: str(row.status),
      term: termYear.term,
      year: termYear.year,
      createdAt: (row.created_at ?? null) as Date | string | null,
    };
  });

  const latestRequestByExamCode = new Map<string, ClinicalExamRequestRow>();
  for (const row of examRequestRows) {
    const code = str(row.examCode).toUpperCase();
    if (code === "") continue;
    if (!latestRequestByExamCode.has(code)) {
      latestRequestByExamCode.set(code, row);
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
    const req = latestRequestByExamCode.get(exam.code);
    const requestStatus = lower(req?.status);
    const isRequestSupplemental =
      requestStatus === "requested" || requestStatus === "cancelled";
    const legacy = exam.signal;
    const hasCompletedLegacy = legacy.code.toUpperCase() === "P" || legacy.code.toUpperCase() === "F";
    if (isRequestSupplemental && !hasCompletedLegacy && legacy.status === "Not Taken") {
      return {
        code: exam.code,
        examName: exam.examName,
        status: requestStatus === "cancelled" ? "Cancelled" : "Requested",
        grade: "-",
        term: req?.term ?? null,
        year: req?.year ?? null,
      };
    }
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
  const assignmentCompletedCount = dedupedAssignmentCompletedCount;
  const completedCount = legacyCompletedCount + assignmentCompletedCount;
  const totalHours = records.reduce((sum, row) => sum + numHours(row.hours), 0);

  console.debug("[clinical-progress] resolved source", {
    requestedParam: requested,
    resolvedStudentsSeqNum: Number.isFinite(resolvedSeqNum) ? resolvedSeqNum : null,
    resolvedStudentCode: resolvedStudentId,
    legacyClinicRowCount: legacyClinicRows.length,
    clinicalAssignmentRowCount: assignmentRows.length,
    studentsExamFields: {
      exam: examRaw,
      level1exam: level1ExamRaw,
      level2exam: level2ExamRaw,
      level3exam: level3ExamRaw,
    },
  });

  return {
    completedCount,
    totalHours,
    records,
    exams,
  };
}
