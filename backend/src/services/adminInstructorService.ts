import { listInstructors } from "../repositories/instructorRepository.js";

export type AdminInstructorDto = {
  id: number;
  instructorId: string;
  name: string;
};

export async function listAdminInstructors(): Promise<AdminInstructorDto[]> {
  const rows = await listInstructors();
  return rows.map((row) => ({
    id: row.sequenceNumber,
    instructorId: row.instructor_id,
    name: row.display_name,
  }));
}
