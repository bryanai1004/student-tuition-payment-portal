/**
 * HTTP/API contract for course bin persistence (per student + academic term).
 * Request bodies may send `registered` / `time` / `days` (frontend CourseBinItem aliases).
 */
export type CourseBinScheduleTrack = "EN" | "CN";

export type CourseBinApiItem = {
  id: number;
  student_id: string;
  academic_term_id: string;
  course_code: string;
  section: string;
  schedule_track: CourseBinScheduleTrack;
  session: string | null;
  type: string | null;
  units: string | null;
  registered_display: string | null;
  time_display: string | null;
  days_display: string | null;
  instructor: string | null;
  location: string | null;
  eng_name: string | null;
  chi_name: string | null;
  prerequisite_course_id: string | null;
  prerequisite_course_code: string | null;
  prerequisite_course_title: string | null;
  schedule_weekday: string | null;
  schedule_start_time: string | null;
  schedule_end_time: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseBinUpsertInput = {
  academic_term_id: string;
  course_code: string;
  section: string;
  schedule_track: CourseBinScheduleTrack;
  session: string | null;
  type: string | null;
  units: string | null;
  registered_display: string | null;
  time_display: string | null;
  days_display: string | null;
  instructor: string | null;
  location: string | null;
  eng_name: string | null;
  chi_name: string | null;
  prerequisite_course_id: string | null;
  prerequisite_course_code: string | null;
  prerequisite_course_title: string | null;
  schedule_weekday: string | null;
  schedule_start_time: string | null;
  schedule_end_time: string | null;
};
