export type AcademicTermName = "Winter" | "Spring" | "Summer" | "Fall";
export type AcademicTermStatus = "planned" | "registration_open" | "in_progress" | "completed";
/** Stable API row for one academic term. */
export type AcademicTermDetail = {
    id: string;
    term_label: string;
    year: number;
    term_name: AcademicTermName;
    quarter_index: number;
    sequence_no: number;
    start_date: string | null;
    end_date: string | null;
    registration_open: string | null;
    registration_close: string | null;
    withdraw_deadline: string | null;
    payment_due_date: string | null;
    lock_registration_if_overdue: boolean;
    status: AcademicTermStatus;
    is_visible: boolean;
    /** When true, this term is the one published on the student dashboard (at most one row). */
    is_posted_to_dashboard: boolean;
};
export type CreateAcademicTermInput = {
    year: number;
    term_name: AcademicTermName;
    sequence_no: number;
    /** If omitted, derived as "{term_name} {year}". */
    term_label?: string;
    start_date?: string | null;
    end_date?: string | null;
    registration_open?: string | null;
    registration_close?: string | null;
    withdraw_deadline?: string | null;
    payment_due_date?: string | null;
    lock_registration_if_overdue?: boolean;
    status: AcademicTermStatus;
    is_visible?: boolean;
};
export type UpdateAcademicTermInput = Partial<CreateAcademicTermInput>;
//# sourceMappingURL=academicTerm.d.ts.map