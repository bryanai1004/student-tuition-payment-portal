/** GET /api/admin/students — normalized roster row for the admin Students table. */
export type AdminStudentListItem = {
  studentId: string;
  name: string;
  program: string | null;
  status: string | null;
  email: string | null;
  balance: number | null;
};
