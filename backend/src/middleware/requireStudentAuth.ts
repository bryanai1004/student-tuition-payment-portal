import type { NextFunction, Request, Response } from "express";
import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readParamValue(req: Request, paramName: string): string | null {
  const raw = req.params[paramName];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return readTrimmedString(value);
}

function readQueryValue(req: Request, key: string): string | null {
  const raw = req.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return readTrimmedString(value);
}

function readBodyValue(req: Request, key: string): string | null {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return null;
  return readTrimmedString(body[key]);
}

function studentIdsMatch(tokenStudentId: string, resourceStudentId: string): boolean {
  return tokenStudentId.trim() === resourceStudentId.trim();
}

/**
 * Verifies student JWT from `Authorization: Bearer` and attaches `req.studentUser`.
 */
export function requireStudentAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = verifyStudentAccessToken(req.headers.authorization);
  if (user == null) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.studentUser = user;
  next();
}

/** Requires `req.studentUser` and matching `:studentId` route param. */
export function requireStudentAuthMatchParam(
  paramName = "studentId",
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authed = req.studentUser;
    if (authed == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const resourceStudentId = readParamValue(req, paramName);
    if (resourceStudentId == null) {
      res.status(400).json({ error: `Missing ${paramName}` });
      return;
    }
    if (!studentIdsMatch(authed.studentId, resourceStudentId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Requires `req.studentUser` and matching query param (e.g. `?studentId=`). */
export function requireStudentAuthMatchQuery(
  key = "studentId",
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authed = req.studentUser;
    if (authed == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const resourceStudentId = readQueryValue(req, key);
    if (resourceStudentId == null) {
      res.status(400).json({ error: `Query parameter ${key} is required.` });
      return;
    }
    if (!studentIdsMatch(authed.studentId, resourceStudentId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Requires `req.studentUser` and matching JSON body field (e.g. `studentId`). */
export function requireStudentAuthMatchBody(
  key = "studentId",
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authed = req.studentUser;
    if (authed == null) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const resourceStudentId = readBodyValue(req, key);
    if (resourceStudentId == null) {
      res.status(400).json({ error: `Request body must include ${key}.` });
      return;
    }
    if (!studentIdsMatch(authed.studentId, resourceStudentId)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
