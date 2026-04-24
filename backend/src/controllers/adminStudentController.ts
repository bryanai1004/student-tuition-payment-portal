import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import {
  buildAdminStudentsCsv,
  createAdminStudentLoa,
  createAdminStudent,
  deleteSelectedAdminStudents,
  getAdminStudentDetail,
  listAdminStudentRegistrationTerms,
  listAdminStudentsPage,
  previewNextAdminStudentId,
  updateAdminStudent,
} from "../services/adminStudentService.js";
import { getStudentAcademicsPayload } from "../services/studentAcademicsService.js";
import {
  AdminStudentPhotoServiceError,
  STUDENT_PHOTO_ALLOWED_MIME_TYPES,
  STUDENT_PHOTO_MAX_SIZE_BYTES,
  getAdminStudentPhotoUrl,
  uploadAdminStudentPhoto,
} from "../services/adminStudentPhotoService.js";
import type {
  AdminStudentCreateBody,
  AdminStudentCreateLoaBody,
  AdminStudentRosterLoaFilter,
  AdminStudentRosterProgramFilter,
  AdminStudentRosterTrackFilter,
  AdminStudentUpdateBody,
} from "../types/adminStudent.js";
import type { StudentProgram } from "../types/studentProgram.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function trimStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseNullableStringField(v: unknown): string | null {
  const s = trimStr(v);
  return s === "" ? null : s;
}

type ParseBodyResult<T> = { ok: true; value: T } | { ok: false; error: string };

const STUDENT_PHOTO_UPLOAD = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: STUDENT_PHOTO_MAX_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (
      STUDENT_PHOTO_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof STUDENT_PHOTO_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPG, JPEG, PNG, and WEBP images are allowed."));
  },
});

function parseStudentProgramField(
  raw: unknown,
  options?: { required?: boolean },
): ParseBodyResult<StudentProgram> {
  if (typeof raw !== "string") {
    return {
      ok: false,
      error:
        options?.required === false
          ? "program must be DAHM or MAHM."
          : "program is required.",
    };
  }
  switch (raw.trim().toUpperCase()) {
    case "DAHM":
      return { ok: true, value: "DAHM" };
    case "MAHM":
      return { ok: true, value: "MAHM" };
    default:
      return { ok: false, error: "program must be DAHM or MAHM." };
  }
}

function parseUpdateBody(raw: unknown): ParseBodyResult<AdminStudentUpdateBody> {
  if (!isRecord(raw) || typeof raw.name !== "string") {
    return { ok: false, error: "Invalid request body." };
  }
  const program = parseStudentProgramField(raw.program);
  if (!program.ok) return program;
  return {
    ok: true,
    value: {
      name: raw.name,
      program: program.value,
      email: parseNullableStringField(raw.email),
      gender: parseNullableStringField(raw.gender),
      backgroundSchool: parseNullableStringField(raw.backgroundSchool),
      highestDegree: parseNullableStringField(raw.highestDegree),
      requirementsId: parseNullableStringField(raw.requirementsId),
      address: parseNullableStringField(raw.address),
      city: parseNullableStringField(raw.city),
      state: parseNullableStringField(raw.state),
      zip: parseNullableStringField(raw.zip),
      signedDate: parseNullableStringField(raw.signedDate),
      enrollStartDate: parseNullableStringField(raw.enrollStartDate),
      ssn: parseNullableStringField(raw.ssn),
      visa: parseNullableStringField(raw.visa),
      dob: parseNullableStringField(raw.dob),
      phone1: parseNullableStringField(raw.phone1),
      phone2: parseNullableStringField(raw.phone2),
      phone3: parseNullableStringField(raw.phone3),
      citizenship: parseNullableStringField(raw.citizenship),
      race: parseNullableStringField(raw.race),
      marital: parseNullableStringField(raw.marital),
    },
  };
}

function parseEntryDateFromBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

function parseRequirementsIdFromBody(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseCreateBody(raw: unknown): ParseBodyResult<AdminStudentCreateBody> {
  if (!isRecord(raw)) return { ok: false, error: "Invalid request body." };
  if (raw.division !== "Chinese" && raw.division !== "English") {
    return { ok: false, error: "Invalid request body." };
  }
  if (typeof raw.name !== "string" || typeof raw.initialPassword !== "string") {
    return { ok: false, error: "Invalid request body." };
  }
  const entryDate = parseEntryDateFromBody(raw.entryDate);
  if (entryDate == null) return { ok: false, error: "Invalid request body." };
  const program = parseStudentProgramField(raw.program);
  if (!program.ok) return program;
  const requirementsId = parseRequirementsIdFromBody(raw.requirementsId);
  if (requirementsId === undefined && raw.requirementsId != null) {
    return { ok: false, error: "Invalid request body." };
  }
  return {
    ok: true,
    value: {
      division: raw.division,
      entryDate,
      name: raw.name,
      program: program.value,
      email: parseNullableStringField(raw.email),
      gender: parseNullableStringField(raw.gender),
      requirementsId:
        requirementsId === undefined ? null : requirementsId,
      highestDegree: parseNullableStringField(raw.highestDegree),
      backgroundSchool: parseNullableStringField(raw.backgroundSchool),
      signedDate: parseNullableStringField(raw.signedDate),
      enrollStartDate: parseNullableStringField(raw.enrollStartDate),
      address: parseNullableStringField(raw.address),
      address2: parseNullableStringField(raw.address2),
      city: parseNullableStringField(raw.city),
      state: parseNullableStringField(raw.state),
      zip: parseNullableStringField(raw.zip),
      initialPassword: raw.initialPassword,
    },
  };
}

function parseCreateLoaBody(
  raw: unknown,
): ParseBodyResult<AdminStudentCreateLoaBody> {
  if (!isRecord(raw)) return { ok: false, error: "Invalid request body." };
  return {
    ok: true,
    value: {
      loaQuarter: trimStr(raw.loaQuarter),
      loaYear: trimStr(raw.loaYear),
      plannedReturnQuarter: trimStr(raw.plannedReturnQuarter),
      plannedReturnYear: trimStr(raw.plannedReturnYear),
      reason: parseNullableStringField(raw.reason),
    },
  };
}

const STUDENT_ID_PARAM = /^[A-Za-z0-9._-]{1,64}$/;

const ADMIN_STUDENT_LIST_DEFAULT_PAGE = 1;
const ADMIN_STUDENT_LIST_DEFAULT_PAGE_SIZE = 25;
const ADMIN_STUDENT_LIST_MAX_PAGE_SIZE = 100;

function normalizeStudentIdParam(raw: string | undefined): string | null {
  const s = raw?.trim() ?? "";
  if (s === "" || !STUDENT_ID_PARAM.test(s)) return null;
  return s;
}

function parsePositiveIntParam(
  raw: unknown,
  fallback: number,
  max?: number,
): number {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (t === "") return fallback;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  const truncated = Math.trunc(n);
  if (max != null && truncated > max) return max;
  return truncated;
}

function parseAdminStudentProgramParam(
  raw: unknown,
): AdminStudentRosterProgramFilter {
  if (typeof raw !== "string") return "all";
  switch (raw.trim().toLowerCase()) {
    case "dahm":
      return "dahm";
    case "mahm":
      return "mahm";
    case "all":
    default:
      return "all";
  }
}

function parseAdminStudentTrackParam(raw: unknown): AdminStudentRosterTrackFilter {
  if (typeof raw !== "string") return "all";
  switch (raw.trim().toUpperCase()) {
    case "C":
      return "C";
    case "E":
      return "E";
    default:
      return "all";
  }
}

function parseAdminStudentEntryYearParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return /^20\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseAdminStudentIntakeCodeParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed === "" ? null : trimmed.slice(0, 1);
}

function parseAdminStudentLoaParam(raw: unknown): AdminStudentRosterLoaFilter {
  if (typeof raw !== "string") return "all";
  switch (raw.trim().toLowerCase()) {
    case "yes":
      return "yes";
    case "no":
      return "no";
    default:
      return "all";
  }
}

function parseAdminStudentLoaQuarterParam(
  raw: unknown,
): "Winter" | "Spring" | "Summer" | "Fall" | null {
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "winter":
      return "Winter";
    case "spring":
      return "Spring";
    case "summer":
      return "Summer";
    case "fall":
      return "Fall";
    default:
      return null;
  }
}

function parseAdminStudentLoaYearParam(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const year = Math.trunc(raw);
    return year >= 1900 && year <= 2100 ? year : null;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  const year = Number.parseInt(trimmed, 10);
  return year >= 1900 && year <= 2100 ? year : null;
}

function parseAdminStudentListViewParam(
  raw: unknown,
): "roster" | "new-enrollment" {
  if (typeof raw !== "string") return "roster";
  return raw.trim().toLowerCase() === "new-enrollment"
    ? "new-enrollment"
    : "roster";
}

function parseAdminStudentIds(raw: unknown): ParseBodyResult<string[]> {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "studentIds must be an array when provided." };
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return { ok: false, error: "Each student id must be a string." };
    }
    const studentId = item.trim();
    if (studentId === "") continue;
    if (!STUDENT_ID_PARAM.test(studentId)) {
      return { ok: false, error: `Invalid student id: ${studentId}` };
    }
    if (!seen.has(studentId)) {
      seen.add(studentId);
      normalized.push(studentId);
    }
  }
  return { ok: true, value: normalized };
}

function parseAdminStudentsExportBody(
  raw: unknown,
): ParseBodyResult<
  | {
      mode: "selected";
      studentIds: string[];
      view: "roster" | "new-enrollment";
    }
  | {
      mode: "filtered";
      search: string;
      program: AdminStudentRosterProgramFilter;
      track: AdminStudentRosterTrackFilter;
      entryYear: string | null;
      intakeCode: string | null;
      loa: AdminStudentRosterLoaFilter;
      loaQuarter: "Winter" | "Spring" | "Summer" | "Fall" | null;
      loaYear: number | null;
      view: "roster" | "new-enrollment";
    }
> {
  if (!isRecord(raw)) return { ok: false, error: "Invalid request body." };
  const studentIds = parseAdminStudentIds(raw.studentIds);
  if (!studentIds.ok) return studentIds;
  const view = parseAdminStudentListViewParam(raw.view);
  if (studentIds.value.length > 0) {
    return {
      ok: true,
      value: {
        mode: "selected",
        studentIds: studentIds.value,
        view,
      },
    };
  }
  const search =
    typeof raw.search === "string" ? raw.search.trim().slice(0, 200) : "";
  const program = parseAdminStudentProgramParam(raw.program);
  const track = parseAdminStudentTrackParam(raw.track);
  const entryYear = parseAdminStudentEntryYearParam(raw.entryYear);
  const intakeCode = parseAdminStudentIntakeCodeParam(raw.intakeCode);
  const loa = parseAdminStudentLoaParam(raw.loa);
  const loaQuarter = parseAdminStudentLoaQuarterParam(raw.loaQuarter);
  const loaYear = parseAdminStudentLoaYearParam(raw.loaYear);
  return {
    ok: true,
    value: {
      mode: "filtered",
      search,
      program,
      track,
      entryYear,
      intakeCode,
      loa,
      loaQuarter,
      loaYear,
      view,
    },
  };
}

function parseClinicalSummaryQueryParam(raw: unknown): boolean {
  const truthy = (v: unknown): boolean =>
    v === "1" || v === "true" || v === "yes";
  if (truthy(raw)) return true;
  if (Array.isArray(raw)) return raw.some((v) => truthy(v));
  return false;
}

function parseIncludeClinicalProgressQueryParam(raw: unknown): boolean {
  const truthy = (v: unknown): boolean =>
    v === "1" || v === "true" || v === "yes";
  if (truthy(raw)) return true;
  if (Array.isArray(raw)) return raw.some((v) => truthy(v));
  return false;
}

const OPTIONAL_ADMIN_STUDENTS_LIST_QUERY_FLAGS = new Set([
  "clinicalSummary",
  "includeAcademicRecords",
  "includeRegistrationHistory",
  "includeClinicalProgress",
  "includeDocuments",
  "includeFinance",
  "includePhoto",
]);

export async function getAdminStudents(
  req: Request,
  res: Response,
): Promise<void> {
  console.time("[admin students list] total");
  try {
    const flaggedIncludes = Object.keys(req.query).filter((key) =>
      OPTIONAL_ADMIN_STUDENTS_LIST_QUERY_FLAGS.has(key),
    );
    if (flaggedIncludes.length > 0) {
      console.warn(
        "[admin students list] optional include requested",
        req.query,
      );
    }
    /** Opt-in only; default is no clinical batch work on the roster. */
    const includeClinicalSummary = parseClinicalSummaryQueryParam(
      req.query.clinicalSummary,
    );
    const page = parsePositiveIntParam(
      req.query.page,
      ADMIN_STUDENT_LIST_DEFAULT_PAGE,
    );
    const pageSize = parsePositiveIntParam(
      req.query.pageSize,
      ADMIN_STUDENT_LIST_DEFAULT_PAGE_SIZE,
      ADMIN_STUDENT_LIST_MAX_PAGE_SIZE,
    );
    const searchRaw = req.query.search;
    const search =
      typeof searchRaw === "string"
        ? searchRaw.trim().slice(0, 200)
        : "";
    const program = parseAdminStudentProgramParam(req.query.program);
    const track = parseAdminStudentTrackParam(req.query.track);
    const entryYear = parseAdminStudentEntryYearParam(req.query.entryYear);
    const intakeCode = parseAdminStudentIntakeCodeParam(req.query.intakeCode);
    const loa = parseAdminStudentLoaParam(req.query.loa);
    const loaQuarter = parseAdminStudentLoaQuarterParam(req.query.loaQuarter);
    const loaYear = parseAdminStudentLoaYearParam(req.query.loaYear);

    const result = await listAdminStudentsPage({
      page,
      pageSize,
      search,
      program,
      track,
      entryYear,
      intakeCode,
      loa,
      loaQuarter,
      loaYear,
      includeClinicalSummary,
    });
    res.json({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      enrollmentFilterOptions: result.enrollmentFilterOptions,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load students" });
  } finally {
    console.timeEnd("[admin students list] total");
  }
}

export async function postExportAdminStudentsCsv(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseAdminStudentsExportBody(req.body);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }

  try {
    const built = await buildAdminStudentsCsv(body.value);
    const asciiName = built.filename.replace(/"/g, "");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiName}"`,
    );
    res.send(Buffer.from(`\uFEFF${built.csvBody}`, "utf8"));
  } catch (e) {
    console.error("[admin/students/export.csv] failed:", e);
    res.status(500).json({ error: "Failed to export students CSV." });
  }
}

function paramStudentId(params: Request["params"]): string | undefined {
  const raw = params.studentId;
  return typeof raw === "string" ? raw : undefined;
}

export function uploadAdminStudentPhotoMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const middleware = STUDENT_PHOTO_UPLOAD.single("photo");
  middleware(req, res, (err: unknown) => {
    if (!err) {
      res.locals.photoUploadReady = true;
      res.locals.photoUploadError = null;
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.locals.photoUploadReady = false;
      res.locals.photoUploadError =
        "Photo must be 5MB or smaller. Supported types: JPG, JPEG, PNG, WEBP.";
      next();
      return;
    }
    res.locals.photoUploadReady = false;
    res.locals.photoUploadError =
      err instanceof Error
        ? err.message
        : "Invalid photo upload request. Supported types: JPG, JPEG, PNG, WEBP.";
    next();
  });
}

export async function getAdminStudent(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = normalizeStudentIdParam(paramStudentId(req.params));
  if (!studentId) {
    res.status(400).json({ error: "Invalid student id." });
    return;
  }
  try {
    const includeClinicalProgress = parseIncludeClinicalProgressQueryParam(
      req.query.includeClinicalProgress,
    );
    const detail = await getAdminStudentDetail(studentId, {
      includeClinicalProgress,
    });
    if (!detail) {
      res.status(404).json({ error: "Student not found." });
      return;
    }
    res.json(detail);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load student" });
  }
}

export async function getAdminStudentRegistrationTerms(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = normalizeStudentIdParam(paramStudentId(req.params));
  if (!studentId) {
    res.status(400).json({ error: "Invalid student id." });
    return;
  }
  try {
    const terms = await listAdminStudentRegistrationTerms(studentId);
    res.json({ terms });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load registration terms." });
  }
}

export async function getAdminStudentAcademicRecords(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = normalizeStudentIdParam(paramStudentId(req.params));
  if (!studentId) {
    res.status(400).json({ error: "Invalid student id." });
    return;
  }
  try {
    const payload = await getStudentAcademicsPayload(studentId);
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load academic records." });
  }
}

export async function getAdminStudentPhotoUrlHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = normalizeStudentIdParam(paramStudentId(req.params));
  if (!studentId) {
    res.status(400).json({ success: false, message: "Invalid student id." });
    return;
  }
  try {
    const result = await getAdminStudentPhotoUrl(studentId);
    res.json(result);
  } catch (err) {
    if (err instanceof AdminStudentPhotoServiceError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error("[admin/students/photo-url] failed:", err);
    res.status(500).json({ success: false, message: "Photo URL request failed." });
  }
}

export async function postAdminStudentPhoto(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = normalizeStudentIdParam(paramStudentId(req.params));
  if (!studentId) {
    res.status(400).json({ success: false, message: "Invalid student id." });
    return;
  }

  if (!res.locals.photoUploadReady) {
    const message =
      typeof res.locals.photoUploadError === "string" &&
      res.locals.photoUploadError.trim() !== ""
        ? res.locals.photoUploadError
        : "Photo upload failed.";
    res.status(400).json({ success: false, message });
    return;
  }

  const file = req.file;
  if (!file || !file.buffer || file.buffer.length === 0) {
    res.status(400).json({ success: false, message: "Photo file is required." });
    return;
  }

  try {
    const result = await uploadAdminStudentPhoto({
      studentId,
      fileBuffer: file.buffer,
      contentType: file.mimetype,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof AdminStudentPhotoServiceError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error("[admin/students/photo] upload failed:", err);
    res.status(500).json({ success: false, message: "Photo upload failed." });
  }
}

export async function getNextAdminStudentId(
  req: Request,
  res: Response,
): Promise<void> {
  const division = req.query.division;
  const entryDate = req.query.entryDate;
  try {
    const result = await previewNextAdminStudentId(division, entryDate);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.json({ studentId: result.studentId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to compute next student id" });
  }
}

export async function postAdminStudent(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseCreateBody(req.body);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }
  try {
    const result = await createAdminStudent(body.value);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.status(201).json({ ok: true, studentId: result.studentId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create student" });
  }
}

export async function postAdminStudentLoa(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = normalizeStudentIdParam(paramStudentId(req.params));
  if (!studentId) {
    res.status(400).json({ error: "Invalid student id." });
    return;
  }

  const body = parseCreateLoaBody(req.body);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }

  try {
    const result = await createAdminStudentLoa(studentId, body.value);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.status(201).json(result.detail);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create LOA record" });
  }
}

export async function postDeleteSelectedAdminStudents(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = req.body as Record<string, unknown> | null | undefined;
  const studentIds = raw?.studentIds;
  try {
    const result = await deleteSelectedAdminStudents(studentIds);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.json({
      ok: true,
      deletedStudentIds: result.deletedStudentIds,
      blocked: result.blocked,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete students" });
  }
}

export async function putAdminStudent(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = normalizeStudentIdParam(paramStudentId(req.params));
  if (!studentId) {
    res.status(400).json({ error: "Invalid student id." });
    return;
  }

  const body = parseUpdateBody(req.body);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }

  try {
    const result = await updateAdminStudent(studentId, body.value);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.json(result.detail);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update student" });
  }
}
