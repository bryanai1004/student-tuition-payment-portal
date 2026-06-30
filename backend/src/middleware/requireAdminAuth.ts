import type { NextFunction, Request, Response } from "express";
import { resolveAuthenticatedAdminFromRequest } from "../lib/adminAuthToken.js";

/**
 * Verifies admin JWT from `Authorization: Bearer` or `admin_access_token` cookie.
 * Attaches `req.adminUser` on success.
 */
export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = resolveAuthenticatedAdminFromRequest(req);
  if (user == null) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.adminUser = user;
  next();
}
