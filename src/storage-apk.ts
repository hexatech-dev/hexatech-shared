import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";

/**
 * Self-hosted APK release distribution via Supabase Storage — the pattern
 * credbox and jalkhata each hand-rolled identically (down to the bucket
 * layout), differing only in bucket name and file-name prefix.
 */

const LATEST_META_PATH = "latest.json";

export interface UploadApkOptions {
  admin: SupabaseClient;
  /** e.g. "credbox-apk-releases" | "apk-releases" */
  bucket: string;
  /** Local path to the built APK, e.g. android/app/build/outputs/apk/release/app-release.apk */
  filePath: string;
  /** e.g. "credbox" | "jalkhata-staff" — file becomes `${fileNamePrefix}-${Date.now()}.apk`. */
  fileNamePrefix: string;
}

export interface UploadApkResult {
  fileName: string;
  publicUrl: string;
}

/**
 * Uploads a built APK to Supabase Storage and overwrites `latest.json` in
 * the same bucket so `resolveLatestApkDownloadUrl` can find it.
 */
export async function uploadApkRelease(
  options: UploadApkOptions,
): Promise<UploadApkResult> {
  const { admin, bucket, filePath, fileNamePrefix } = options;

  const file = fs.readFileSync(filePath);
  const fileName = `${fileNamePrefix}-${Date.now()}.apk`;

  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(fileName, file, {
      contentType: "application/vnd.android.package-archive",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`APK upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = admin.storage.from(bucket).getPublicUrl(fileName);

  await admin.storage.from(bucket).upload(
    LATEST_META_PATH,
    JSON.stringify({
      url: urlData.publicUrl,
      fileName,
      uploadedAt: new Date().toISOString(),
    }),
    { contentType: "application/json", upsert: true },
  );

  return { fileName, publicUrl: urlData.publicUrl };
}

export interface LatestApkMeta {
  url: string;
  fileName: string;
  uploadedAt: string;
}

/**
 * Reads `latest.json` written by `uploadApkRelease`. Returns `null` — never
 * throws — when no release has been uploaded yet or the file is missing or
 * malformed, so a download-redirect route can just do
 * `if (!meta) return res.status(404)...`, matching credbox's existing
 * `/app/download` behavior.
 */
export async function resolveLatestApkDownloadUrl(
  admin: SupabaseClient,
  bucket: string,
): Promise<LatestApkMeta | null> {
  const { data: blob, error } = await admin.storage
    .from(bucket)
    .download(LATEST_META_PATH);
  if (error || !blob) return null;

  try {
    const meta = JSON.parse(await blob.text()) as Partial<LatestApkMeta>;
    if (typeof meta.url !== "string" || meta.url.length === 0) return null;
    return {
      url: meta.url,
      fileName: typeof meta.fileName === "string" ? meta.fileName : "",
      uploadedAt: typeof meta.uploadedAt === "string" ? meta.uploadedAt : "",
    };
  } catch {
    return null;
  }
}
