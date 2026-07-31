import type { SupabaseClient } from "@supabase/supabase-js";

/** Browser-safe — only ever imports `@supabase/supabase-js`. */

function inferImageExtension(file: File): string {
  const fromName = /\.[a-zA-Z0-9]{1,10}$/.exec(file.name)?.[0];
  if (fromName) return fromName;
  switch (file.type) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

export interface UploadPublicImageOptions {
  /** Anon-key client with an active session — bucket access is governed by RLS. */
  supabase: SupabaseClient;
  bucket: string;
  file: File;
  /** Path prefix inside the bucket, e.g. "tournaments/logos" — no leading/trailing slashes. */
  pathPrefix: string;
  /** Defaults to the current session's user id, matching the RLS-keyed path
   * convention `<prefix>/<ownerId>/<uuid><ext>`. */
  ownerId?: string;
}

/**
 * Uploads an image straight from the browser to Supabase Storage and returns
 * its public HTTPS URL. Generalized from sportik's direct-to-bucket image
 * upload (the only consumer today) so the next product that needs
 * avatar/logo uploads doesn't recreate this from scratch.
 */
export async function uploadPublicImage(
  options: UploadPublicImageOptions,
): Promise<string> {
  const { supabase, bucket, file, pathPrefix } = options;

  let ownerId = options.ownerId;
  if (!ownerId) {
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
    if (sessionErr) throw new Error(sessionErr.message);
    if (!session?.user?.id) throw new Error("Not signed in.");
    ownerId = session.user.id;
  }

  const prefix = pathPrefix.replace(/^\/+|\/+$/g, "");
  const ext = inferImageExtension(file);
  const objectPath = `${prefix}/${ownerId}/${crypto.randomUUID()}${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
