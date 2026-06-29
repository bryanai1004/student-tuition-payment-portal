import { pool, type ResultSetHeader, type RowDataPacket } from "../lib/db.js";

export type CourseCategoryLookupRow = {
  id: number;
  category_id: string;
  category_name: string;
};

export async function listCourseCategoryLookup(): Promise<
  CourseCategoryLookupRow[]
> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,
            TRIM(category_id) AS category_id,
            TRIM(category_name) AS category_name
     FROM course_category
     ORDER BY id`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    category_id: String(r.category_id ?? "").trim(),
    category_name: String(r.category_name ?? "").trim(),
  }));
}

export type SchoolCourseCatalogPatch = {
  units?: number;
  category?: string;
};

/**
 * Updates `school.courses` by primary key. Optionally syncs `portal_courses.units`
 * for the same course code when units change.
 */
export async function updateSchoolCourseBySequenceNumber(
  sequenceNumber: number,
  patch: SchoolCourseCatalogPatch,
): Promise<{ ok: true; affected: number } | { ok: false; error: string }> {
  if (
    patch.units === undefined &&
    patch.category === undefined
  ) {
    return { ok: false, error: "Nothing to update (provide units and/or category)." };
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.units !== undefined) {
    sets.push("`units` = ?");
    params.push(patch.units);
  }
  if (patch.category !== undefined) {
    sets.push("`category` = ?");
    params.push(patch.category);
  }

  params.push(sequenceNumber);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query<ResultSetHeader>(
      `UPDATE courses SET ${sets.join(", ")} WHERE sequenceNumber = ?`,
      params,
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return { ok: false, error: "Course not found." };
    }

    if (patch.units !== undefined) {
      const [codeRows] = await conn.query<RowDataPacket[]>(
        "SELECT TRIM(code) AS code FROM courses WHERE sequenceNumber = ? LIMIT 1",
        [sequenceNumber],
      );
      const code =
        codeRows.length > 0 ? String(codeRows[0]!.code ?? "").trim() : "";
      if (code !== "") {
        await conn.query(
          `UPDATE portal_courses
           SET units = ?
           WHERE TRIM(course_code) = ?`,
          [patch.units, code],
        );
      }
    }

    await conn.commit();
    return { ok: true, affected: result.affectedRows };
  } catch (e) {
    await conn.rollback();
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    conn.release();
  }
}
