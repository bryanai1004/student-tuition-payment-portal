/**
 * HTTP/API contract for course bin persistence.
 * DB column names use *_display for schedule strings; request bodies may send
 * `registered` / `time` / `days` (frontend CourseBinItem) and controllers map them.
 */
export type CourseBinApiItem = {
  id: number;
  student_id: string;
  course_code: string;
  section: string;
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
  created_at: string;
  updated_at: string;
};

export type CourseBinUpsertInput = {
  course_code: string;
  section: string;
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
};
