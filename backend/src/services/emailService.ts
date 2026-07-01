import nodemailer, { type Transporter } from "nodemailer";
import { env, type SmtpProfile } from "../config/env.js";

export type EmailAttachment = {
  filename?: string;
  content: Buffer | string;
  cid?: string;
};

export type SendEmailInput = {
  /** Visible recipients (rare for bulk staff→student). Usually empty in favor of `bcc`. */
  to?: string[];
  /** BCC recipients — preferred for bulk so students do not see each other's addresses. */
  bcc?: string[];
  /** Reply-To header so student replies route to a real person (e.g. the logged-in admin). */
  replyTo?: string | null;
  subject: string;
  /** Plaintext body. */
  text: string;
  /** Optional HTML body. If both provided, mail clients pick one based on prefs. */
  html?: string;
  /** Optional inline/regular attachments (e.g. CID logo for HTML templates). */
  attachments?: EmailAttachment[];
  /** Optional sender profile id (must exist in `env.smtp.profiles`). When omitted, the
   * first configured profile is used. When no profiles exist, the message is logged
   * with `delivered: false` instead of being sent. */
  profileId?: string | null;
};

export type SendEmailResult = {
  /** `true` when the SMTP server accepted the message; `false` when the no-op transport ran. */
  delivered: boolean;
  /** Provider message id when available. Useful for audit trails. */
  messageId: string | null;
  /** When `delivered` is false, explains why (e.g. "SMTP not configured"). */
  note?: string;
  /** Profile id used to send (or null for the no-op fallback). */
  profileId: string | null;
};

const transporters = new Map<string, Transporter>();

function buildTransporter(profile: SmtpProfile): Transporter {
  return nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.secure,
    auth: {
      user: profile.user,
      pass: profile.password,
    },
    requireTLS: !profile.secure,
  });
}

function getTransporter(profile: SmtpProfile): Transporter {
  const existing = transporters.get(profile.id);
  if (existing != null) return existing;
  const transporter = buildTransporter(profile);
  transporters.set(profile.id, transporter);
  return transporter;
}

function buildFromHeader(profile: SmtpProfile): string {
  const name = profile.fromName.replace(/"/g, "");
  return `"${name}" <${profile.fromAddress}>`;
}

/** Public list of senders for the `/api/admin/email/profiles` endpoint. Excludes credentials. */
export type SmtpProfilePublic = {
  id: string;
  label: string;
  fromAddress: string;
  fromName: string;
  host: string;
};

export function listSmtpProfilesPublic(): SmtpProfilePublic[] {
  return env.smtp.profiles.map((p) => ({
    id: p.id,
    label: p.label,
    fromAddress: p.fromAddress,
    fromName: p.fromName,
    host: p.host,
  }));
}

function resolveProfile(profileId: string | null | undefined): SmtpProfile | null {
  if (env.smtp.profiles.length === 0) return null;
  if (profileId == null || profileId === "") {
    return env.smtp.profiles[0] ?? null;
  }
  const wanted = profileId.toLowerCase();
  const match = env.smtp.profiles.find((p) => p.id === wanted);
  return match ?? null;
}

/**
 * Send an email via the configured SMTP provider for `profileId` (or the first profile
 * when omitted). When no profiles are configured, the message is logged to the server
 * console with `delivered: false` so callers can still surface a meaningful response
 * to the UI without crashing.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const subject = input.subject.trim();
  if (subject === "") {
    throw new Error("Subject is required.");
  }
  const recipients = (input.to ?? []).concat(input.bcc ?? []);
  if (recipients.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  if (env.smtp.profiles.length === 0) {
    const truncatedText =
      input.text.length > 500 ? `${input.text.slice(0, 500)}…` : input.text;
    console.warn(
      "[email] No SMTP profiles configured — logging message instead of sending",
      {
        to: input.to ?? [],
        bcc: input.bcc ?? [],
        replyTo: input.replyTo ?? null,
        subject,
        textPreview: truncatedText,
      },
    );
    return {
      delivered: false,
      messageId: null,
      profileId: null,
      note: "No SMTP sender profiles configured on the server. Set SMTP_PROFILES in backend/.env (or the legacy SMTP_HOST/SMTP_USER vars) and restart.",
    };
  }

  const profile = resolveProfile(input.profileId);
  if (profile == null) {
    return {
      delivered: false,
      messageId: null,
      profileId: input.profileId ?? null,
      note: `Sender profile "${input.profileId}" is not configured on this server.`,
    };
  }

  const transporter = getTransporter(profile);
  const info = await transporter.sendMail({
    from: buildFromHeader(profile),
    to: input.to && input.to.length > 0 ? input.to : undefined,
    bcc: input.bcc && input.bcc.length > 0 ? input.bcc : undefined,
    replyTo: input.replyTo ?? undefined,
    subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });

  return {
    delivered: true,
    messageId: typeof info.messageId === "string" ? info.messageId : null,
    profileId: profile.id,
  };
}

/**
 * Verify each configured SMTP profile's connectivity. Useful for a future health-check route.
 */
export async function verifyEmailTransports(): Promise<
  Array<{ profileId: string; configured: true; ok: boolean; error?: string }>
> {
  const results: Array<{
    profileId: string;
    configured: true;
    ok: boolean;
    error?: string;
  }> = [];
  for (const profile of env.smtp.profiles) {
    try {
      await getTransporter(profile).verify();
      results.push({ profileId: profile.id, configured: true, ok: true });
    } catch (e) {
      results.push({
        profileId: profile.id,
        configured: true,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
