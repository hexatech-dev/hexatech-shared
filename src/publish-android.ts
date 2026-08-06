import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { uploadApkRelease } from "./storage-apk.js";

const APK_RELATIVE_PATH = "app/build/outputs/apk/release/app-release.apk";

export interface PublishAndroidOptions {
  admin: SupabaseClient;
  /** Absolute path to the product's `android/` directory. */
  androidDir: string;
  /** e.g. "credbox-apk-releases" */
  bucket: string;
  /** e.g. "credbox" — uploaded file becomes `${fileNamePrefix}-${Date.now()}.apk`. */
  fileNamePrefix: string;
  /** e.g. "CredBox" — used only in the console summary. */
  productLabel: string;
}

function readVersion(buildGradlePath: string): {
  versionName: string;
  versionCode: number;
} {
  const gradle = readFileSync(buildGradlePath, "utf8");
  const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const versionCode = gradle.match(/versionCode\s+(\d+)/)?.[1];
  if (!versionName || !versionCode) {
    throw new Error(
      `Could not read versionName/versionCode from ${buildGradlePath}`,
    );
  }
  return { versionName, versionCode: parseInt(versionCode, 10) };
}

function buildReleaseApk(androidDir: string, apkPath: string) {
  if (!existsSync(path.join(androidDir, "keystore.properties"))) {
    throw new Error(
      "android/keystore.properties is missing — the release build would be unsigned. " +
        "Generate a release keystore first (see android/app/build.gradle).",
    );
  }

  console.log("Building signed release APK (./gradlew assembleRelease)...");
  execFileSync("./gradlew", ["assembleRelease"], {
    cwd: androidDir,
    stdio: "inherit",
  });

  if (!existsSync(apkPath)) {
    throw new Error(`Expected APK not found at ${apkPath}`);
  }
}

/**
 * Builds the signed release APK (`./gradlew assembleRelease`) and uploads it
 * via `uploadApkRelease` — the shared build+publish step behind every
 * product's `release:android` script. Requires `android/keystore.properties`
 * to exist and Supabase admin credentials in the environment.
 */
export async function publishAndroidRelease(
  options: PublishAndroidOptions,
): Promise<void> {
  const { admin, androidDir, bucket, fileNamePrefix, productLabel } = options;
  const buildGradlePath = path.join(androidDir, "app/build.gradle");
  const apkPath = path.join(androidDir, APK_RELATIVE_PATH);

  const { versionName, versionCode } = readVersion(buildGradlePath);
  console.log(`Publishing ${productLabel} Android v${versionName} (${versionCode})`);

  buildReleaseApk(androidDir, apkPath);

  const { fileName, publicUrl } = await uploadApkRelease({
    admin,
    bucket,
    filePath: apkPath,
    fileNamePrefix,
    versionName,
    versionCode,
  });

  console.log("\nDone.");
  console.log(`  Version:     ${versionName} (${versionCode})`);
  console.log(`  File:        ${fileName}`);
  console.log(`  Public URL:  ${publicUrl}`);
  console.log("  API:         GET /api/android/latest, GET /api/android/download");
}
