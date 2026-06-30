import type { CourseSectionDetail } from "../repositories/courseSectionRepository.js";
import type { ScheduleRow } from "../types/studentAccount.js";
import type { StudentAcademicsScheduleItem } from "../types/studentAcademics.js";
import {
  formatMysqlTime,
  isClinicalCourse,
} from "./studentAcademicCourseRecords.js";

function sectionTitle(section: CourseSectionDetail): string {
  const t = section.course_title?.trim() ?? "";
  return t !== "" ? t : section.course_code.trim();
}

function scheduleTextFromSection(section: CourseSectionDetail): string {
  const dayPart = section.weekday?.trim() ?? "";
  const tf = formatMysqlTime(section.start_time);
  const tt = formatMysqlTime(section.end_time);
  if (tf && tt) {
    return dayPart ? `${dayPart}, ${tf}–${tt}` : `${tf}–${tt}`;
  }
  return dayPart || "—";
}

/** Map enrolled-section rows to GET /academics `currentSchedule` items. */
export function courseSectionDetailsToAcademicsScheduleItems(
  sections: CourseSectionDetail[],
): StudentAcademicsScheduleItem[] {
  return sections.map((s) => ({
    courseCode: s.course_code.trim(),
    courseTitle: sectionTitle(s),
    days: s.weekday?.trim() || null,
    timeFrom: formatMysqlTime(s.start_time),
    timeTo: formatMysqlTime(s.end_time),
    instructor: s.instructor?.trim() || null,
    term: s.term.trim(),
    year: s.year,
    credits: s.units,
    status: "active",
  }));
}

/** Map enrolled-section rows to account/dashboard `scheduleRows`. */
export function courseSectionDetailsToAccountScheduleRows(
  sections: CourseSectionDetail[],
): ScheduleRow[] {
  return sections.map((s) => {
    const title = sectionTitle(s);
    const clinical = isClinicalCourse(s.course_code, title);
    const room = s.room?.trim() ?? "";
    const instructor = s.instructor?.trim() ?? "";
    return {
      courseCode: s.course_code.trim(),
      title,
      type: clinical ? "clinical" : "didactic",
      units: clinical ? null : s.units != null && s.units > 0 ? s.units : null,
      hours: clinical ? (s.units != null && s.units > 0 ? s.units : null) : null,
      charge: 0,
      schedule: scheduleTextFromSection(s) || null,
      location: room !== "" ? room : null,
      instructor: instructor !== "" ? instructor : null,
    };
  });
}
