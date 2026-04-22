import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";
import {
  STUDENT_PHOTO_ALLOWED_MIME_TYPES,
  STUDENT_PHOTO_MAX_SIZE_BYTES,
  StudentPhotoServiceError,
  getStudentPhotoUrl,
  uploadStudentPhotoForStudentId,
} from "../services/adminStudentPhotoService.js";

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

function getAuthenticatedStudentId(req: Request): string | null {
  const authStudent = verifyStudentAccessToken(req.headers.authorization);
  return authStudent?.studentId?.trim() || null;
}

export function uploadStudentMyPhotoMiddleware(
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

export async function getStudentMyPhotoUrlHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = getAuthenticatedStudentId(req);
  if (!studentId) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  try {
    const result = await getStudentPhotoUrl(studentId);
    res.json(result);
  } catch (err) {
    if (err instanceof StudentPhotoServiceError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error("[student/me/photo-url] failed:", err);
    res.status(500).json({ success: false, message: "Photo URL request failed." });
  }
}

export async function postStudentMyPhotoHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = getAuthenticatedStudentId(req);
  if (!studentId) {
    res.status(401).json({ success: false, message: "Authentication required." });
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
    const result = await uploadStudentPhotoForStudentId({
      studentId,
      fileBuffer: file.buffer,
      contentType: file.mimetype,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof StudentPhotoServiceError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error("[student/me/photo] upload failed:", err);
    res.status(500).json({ success: false, message: "Photo upload failed." });
  }
}
