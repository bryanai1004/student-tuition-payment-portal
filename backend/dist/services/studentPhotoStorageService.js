import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
const STUDENT_PHOTO_SIGNED_URL_TTL_SECONDS = 3600;
let supabaseClient = null;
function requireSupabaseStorageConfig() {
    const url = env.supabase.url;
    const serviceRoleKey = env.supabase.serviceRoleKey;
    const bucket = env.supabase.storageBucket.trim();
    if (!url || !serviceRoleKey) {
        throw new Error("Missing Supabase storage configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    if (bucket === "") {
        throw new Error("SUPABASE_STORAGE_BUCKET cannot be empty.");
    }
    return { url, serviceRoleKey, bucket };
}
function getSupabaseClient() {
    if (supabaseClient)
        return supabaseClient;
    const cfg = requireSupabaseStorageConfig();
    supabaseClient = createClient(cfg.url, cfg.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return supabaseClient;
}
function extFromContentType(contentType) {
    switch (contentType.trim().toLowerCase()) {
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/png":
            return "png";
        case "image/webp":
            return "webp";
        default:
            throw new Error(`Unsupported image contentType: ${contentType}`);
    }
}
function buildStudentPhotoPath(studentIdRaw, contentType) {
    const studentId = studentIdRaw.trim();
    if (studentId === "")
        throw new Error("Missing student id for storage path.");
    const ext = extFromContentType(contentType);
    const timestamp = Date.now();
    const rand = randomBytes(4).toString("hex");
    return `students/${studentId}/profile/${timestamp}-${rand}.${ext}`;
}
export async function uploadStudentPhoto(input) {
    const cfg = requireSupabaseStorageConfig();
    const path = buildStudentPhotoPath(input.studentId, input.contentType);
    const client = getSupabaseClient();
    const { error } = await client.storage.from(cfg.bucket).upload(path, input.fileBuffer, {
        contentType: input.contentType,
        upsert: false,
    });
    if (error) {
        throw new Error(`Supabase upload failed: ${error.message}`);
    }
    return path;
}
export async function createStudentPhotoSignedUrl(photoPath, ttlSeconds = STUDENT_PHOTO_SIGNED_URL_TTL_SECONDS) {
    const cfg = requireSupabaseStorageConfig();
    const path = photoPath.trim();
    if (path === "")
        throw new Error("photoPath is required.");
    const client = getSupabaseClient();
    const { data, error } = await client.storage
        .from(cfg.bucket)
        .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Failed to create signed URL.");
    }
    return data.signedUrl;
}
export async function deleteStudentPhoto(photoPath) {
    const cfg = requireSupabaseStorageConfig();
    const path = photoPath.trim();
    if (path === "")
        return;
    const client = getSupabaseClient();
    const { error } = await client.storage.from(cfg.bucket).remove([path]);
    if (error) {
        throw new Error(`Supabase delete failed: ${error.message}`);
    }
}
//# sourceMappingURL=studentPhotoStorageService.js.map