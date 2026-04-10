import {
  selectCourseNamesByCode,
  selectDistinctMarksInstructorsForCourse,
  selectDistinctTimetableInstructorPairsForCourse,
  selectInstructorNamesMapForInstructorIds,
  type InstructorNamesRow,
} from "../repositories/adminCourseMetaRepository.js";

export type InstructorSuggestion = {
  source: "timetable" | "marks";
  instructorId: string | null;
  nameEng: string | null;
  nameChi: string | null;
  rawText: string | null;
};

export type ResolvedCourseMeta = {
  title: string;
  /** @deprecated Prefer `instructorSuggestion` + stable display (eng → chi → raw); kept Chinese-first for compatibility. */
  suggestedInstructor: string | null;
  instructorSuggestion: InstructorSuggestion | null;
};

function titleFromCourseRow(
  row: { chi_name: string; eng_name: string } | null,
  courseCode: string,
): string {
  if (row != null) {
    if (row.chi_name.trim() !== "") return row.chi_name.trim();
    if (row.eng_name.trim() !== "") return row.eng_name.trim();
  }
  return courseCode;
}

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/** Chinese-first string for legacy `suggestedInstructor` consumers. */
function legacySuggestedInstructor(s: InstructorSuggestion): string | null {
  const eng = s.nameEng?.trim() ?? "";
  const chi = s.nameChi?.trim() ?? "";
  const raw = s.rawText?.trim() ?? "";
  if (chi !== "") return chi;
  if (eng !== "") return eng;
  return raw !== "" ? raw : null;
}

function buildMeta(
  title: string,
  suggestion: InstructorSuggestion | null,
): ResolvedCourseMeta {
  return {
    title,
    instructorSuggestion: suggestion,
    suggestedInstructor:
      suggestion != null ? legacySuggestedInstructor(suggestion) : null,
  };
}

/**
 * Stable pick from non-empty strings (deterministic across runs).
 */
function pickStableDisplay(candidates: string[]): string | null {
  const unique = [...new Set(candidates.map((s) => s.trim()).filter((s) => s !== ""))];
  if (unique.length === 0) return null;
  unique.sort((a, b) => a.localeCompare(b));
  return unique[0]!;
}

type TimetableInstructorPair = {
  instructor_id: string;
  instructor: string;
};

/**
 * Lexicographic tie-break for choosing one timetable instructor when several IDs exist:
 * name_eng → name_chi → raw `instructor` values for that id → instructor_id.
 */
function timetableInstructorSortKey(
  pairs: TimetableInstructorPair[],
  nameMap: Map<string, InstructorNamesRow>,
  instructorId: string,
): string {
  const row = nameMap.get(instructorId);
  const eng = row != null ? trimOrNull(row.name_eng) : null;
  const chi = row != null ? trimOrNull(row.name_chi) : null;
  if (eng != null) return eng;
  if (chi != null) return chi;
  const rawFromTable = pickStableDisplay(
    pairs
      .filter((p) => p.instructor_id.trim() === instructorId)
      .map((p) => p.instructor.trim())
      .filter((s) => s !== ""),
  );
  if (rawFromTable != null) return rawFromTable;
  return instructorId;
}

function timetableSuggestionForInstructorId(
  pairs: TimetableInstructorPair[],
  nameMap: Map<string, InstructorNamesRow>,
  onlyId: string,
): InstructorSuggestion {
  const row = nameMap.get(onlyId);
  const nameEng = row != null ? trimOrNull(row.name_eng) : null;
  const nameChi = row != null ? trimOrNull(row.name_chi) : null;
  let rawText: string | null = null;
  if (nameEng == null && nameChi == null) {
    const rawFromTable = pickStableDisplay(
      pairs
        .filter((p) => p.instructor_id.trim() === onlyId)
        .map((p) => p.instructor.trim())
        .filter((s) => s !== ""),
    );
    const fallback = trimOrNull(onlyId);
    rawText = rawFromTable ?? fallback;
  }
  return {
    source: "timetable",
    instructorId: onlyId,
    nameEng,
    nameChi,
    rawText,
  };
}

/**
 * Resolve instructor hint from timetable / timetable2 / daim_timetable / daim_timetable2:
 * mapped name_eng → name_chi → raw `instructor` column → instructor_id string.
 * When multiple historical values exist, pick one stable display (lexicographic).
 */
async function instructorSuggestionFromTimetable(
  course_code: string,
): Promise<InstructorSuggestion | null> {
  const pairs = await selectDistinctTimetableInstructorPairsForCourse(course_code);
  if (pairs.length === 0) return null;

  const nonEmptyIds = [
    ...new Set(
      pairs.map((p) => p.instructor_id.trim()).filter((id) => id !== ""),
    ),
  ];
  const nameMap = await selectInstructorNamesMapForInstructorIds(nonEmptyIds);

  const rowDisplays: string[] = [];
  for (const p of pairs) {
    const id = p.instructor_id.trim();
    const rawCol = p.instructor.trim();
    if (id !== "") {
      const row = nameMap.get(id);
      const eng = row != null ? trimOrNull(row.name_eng) : null;
      const chi = row != null ? trimOrNull(row.name_chi) : null;
      if (eng != null) rowDisplays.push(eng);
      if (chi != null) rowDisplays.push(chi);
      if (eng == null && chi == null) {
        if (rawCol !== "") rowDisplays.push(rawCol);
        else rowDisplays.push(id);
      }
    } else if (rawCol !== "") {
      rowDisplays.push(rawCol);
    }
  }

  if (nonEmptyIds.length === 1) {
    return timetableSuggestionForInstructorId(pairs, nameMap, nonEmptyIds[0]!);
  }

  if (nonEmptyIds.length > 1) {
    const candidates = nonEmptyIds.map((id) =>
      timetableSuggestionForInstructorId(pairs, nameMap, id),
    );
    candidates.sort((a, b) => {
      const idA = a.instructorId ?? "";
      const idB = b.instructorId ?? "";
      const keyA = timetableInstructorSortKey(pairs, nameMap, idA);
      const keyB = timetableInstructorSortKey(pairs, nameMap, idB);
      const c = keyA.localeCompare(keyB);
      if (c !== 0) return c;
      return idA.localeCompare(idB);
    });
    return candidates[0]!;
  }

  const chosen = pickStableDisplay(rowDisplays);
  if (chosen == null) return null;

  return {
    source: "timetable",
    instructorId: null,
    nameEng: null,
    nameChi: null,
    rawText: chosen,
  };
}

/**
 * Admin course-section helper: authoritative Chinese-first title from `courses`, and an instructor
 * hint from legacy timetables (any available name) or marks (first stable string when multiple).
 */
export async function resolveCourseMeta(
  courseCodeRaw: string,
): Promise<ResolvedCourseMeta | null> {
  const course_code = courseCodeRaw.trim();
  if (course_code === "") return null;

  const courseRow = await selectCourseNamesByCode(course_code);
  const title = titleFromCourseRow(courseRow, course_code);

  const fromTimetable = await instructorSuggestionFromTimetable(course_code);
  if (fromTimetable != null) {
    return buildMeta(title, fromTimetable);
  }

  const marksNames = await selectDistinctMarksInstructorsForCourse(course_code);
  const marksPick = pickStableDisplay(marksNames);
  if (marksPick != null) {
    const suggestion: InstructorSuggestion = {
      source: "marks",
      instructorId: null,
      nameEng: null,
      nameChi: null,
      rawText: marksPick,
    };
    return buildMeta(title, suggestion);
  }

  return buildMeta(title, null);
}
