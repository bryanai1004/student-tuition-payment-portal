const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeLoginEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 255) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

/** CareConnect-style mask: first local char + bullets + domain. */
export function maskLoginEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at <= 0) return "••••";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain.length === 0) return "••••";
  const first = local[0] ?? "•";
  return `${first}••••@${domain}`;
}

export type StudentLoginEmailStatus = {
  verified: boolean;
  emailMasked: string | null;
  verifiedAt: string | null;
};

export function toLoginEmailStatus(input: {
  email: string;
  verifiedAt: string;
} | null): StudentLoginEmailStatus {
  if (input == null) {
    return { verified: false, emailMasked: null, verifiedAt: null };
  }
  return {
    verified: true,
    emailMasked: maskLoginEmail(input.email),
    verifiedAt: input.verifiedAt,
  };
}
