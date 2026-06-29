import { pool, type RowDataPacket } from "../lib/db.js";

export type InstructorRow = {
  sequenceNumber: number;
  instructor_id: string;
  display_name: string;
};

function mapInstructorRow(row: RowDataPacket): InstructorRow {
  return {
    sequenceNumber: Number(row.sequenceNumber),
    instructor_id: String(row.instructor_id ?? ""),
    display_name: String(row.display_name ?? ""),
  };
}

export async function listInstructors(): Promise<InstructorRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
  sequenceNumber,
  instructor_id,
  CASE
    WHEN name_eng IS NOT NULL AND TRIM(name_eng) <> '' THEN name_eng
    WHEN name_chi IS NOT NULL AND TRIM(name_chi) <> '' THEN name_chi
    ELSE instructor_id
  END AS display_name
FROM instructors
WHERE
  (name_eng IS NOT NULL AND TRIM(name_eng) <> '')
  OR (name_chi IS NOT NULL AND TRIM(name_chi) <> '')
  OR (instructor_id IS NOT NULL AND TRIM(instructor_id) <> '')
ORDER BY display_name;`,
  );
  return rows.map(mapInstructorRow);
}
