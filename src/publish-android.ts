import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveLatestApkDownloadUrl, uploadApkRelease } from "./storage-apk.js";

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

interface Version {
  versionName: string;
  versionCode: number;
}

function readVersion(buildGradlePath: string): Version {
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

function writeVersion(buildGradlePath: string, version: Version) {
  const gradle = readFileSync(buildGradlePath, "utf8");
  const updated = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${version.versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version.versionName}"`);
  writeFileSync(buildGradlePath, updated);
}

/** `"1.2"` -> `"1.3"`. Falls back to the input unchanged if it isn't `MAJOR.MINOR`. */
function suggestNextVersionName(versionName: string): string {
  const match = versionName.match(/^(\d+)\.(\d+)$/);
  if (!match) return versionName;
  const [, major, minor] = match;
  return `${major}.${parseInt(minor, 10) + 1}`;
}

/**
 * Shows the locally-configured version next to whatever's actually live in
 * the bucket, then prompts for the version to publish — so a forgotten bump
 * in `build.gradle` (previously a silent re-publish of an unchanged version,
 * invisible to `useAppUpdateCheck` on installed devices) becomes a visible
 * choice every time instead of a manual pre-flight step.
 */
async function promptForVersion(
  local: Version,
  published: Version | null,
): Promise<Version> {
  console.log(
    `Local build.gradle:  ${local.versionName} (${local.versionCode})`,
  );
  console.log(
    published
      ? `Currently published: ${published.versionName} (${published.versionCode})`
      : "Currently published: none yet",
  );

  const floorCode = Math.max(local.versionCode, published?.versionCode ?? 0);
  const suggestedName = suggestNextVersionName(
    published && published.versionCode >= local.versionCode
      ? published.versionName
      : local.versionName,
  );
  const suggestedCode = floorCode + 1;

  if (!process.stdin.isTTY) {
    throw new Error(
      "publishAndroidRelease needs an interactive terminal to confirm the " +
        "release version (no TTY attached). Run it directly, not from a " +
        "non-interactive script.",
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const nameAnswer = (
      await rl.question(`New version name [${suggestedName}]: `)
    ).trim();
    const versionName = nameAnswer || suggestedName;
    if (!versionName) {
      throw new Error("Version name cannot be empty.");
    }

    const codeAnswer = (
      await rl.question(`New version code [${suggestedCode}]: `)
    ).trim();
    const versionCode = codeAnswer ? parseInt(codeAnswer, 10) : suggestedCode;
    if (!Number.isInteger(versionCode) || versionCode <= floorCode) {
      throw new Error(
        `versionCode must be an integer greater than ${floorCode} ` +
          `(local + published high-water mark) — got "${codeAnswer}".`,
      );
    }

    return { versionName, versionCode };
  } finally {
    rl.close();
  }
}

function buildReleaseApk(androidDir: string, apkPath: string) {
  // Every product reads signing config from a git-ignored keystore.properties
  // at build time (never hardcoded/committed in build.gradle) — checked here
  // for a clear early error instead of a confusing unsigned-APK failure deep
  // in a multi-minute Gradle build.
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
 *
 * Before building, prompts (interactively) for the version to publish,
 * pre-filled with a suggested bump past both the local `build.gradle` and
 * whatever's currently live in the bucket, then writes the confirmed
 * version back to `build.gradle` — so bumping is a confirmation, not a
 * manual edit you have to remember to make first.
 */
export async function publishAndroidRelease(
  options: PublishAndroidOptions,
): Promise<void> {
  const { admin, androidDir, bucket, fileNamePrefix, productLabel } = options;
  const buildGradlePath = path.join(androidDir, "app/build.gradle");
  const apkPath = path.join(androidDir, APK_RELATIVE_PATH);

  const local = readVersion(buildGradlePath);
  const publishedMeta = await resolveLatestApkDownloadUrl(admin, bucket);
  const published =
    publishedMeta?.versionCode != null && publishedMeta.versionName != null
      ? { versionName: publishedMeta.versionName, versionCode: publishedMeta.versionCode }
      : null;

  const { versionName, versionCode } = await promptForVersion(local, published);
  writeVersion(buildGradlePath, { versionName, versionCode });

  console.log(`\nPublishing ${productLabel} Android v${versionName} (${versionCode})`);

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
