import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidDirectory = join(root, "android");
const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const gradle = join(androidDirectory, wrapper);

try {
  await access(gradle);
} catch {
  console.error("Android platform topilmadi. Avval `npm run android:init` bajaring.");
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  const sync = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["cap", "sync", "android"],
    { cwd: root, stdio: "inherit" },
  );
  if (sync.status !== 0) process.exit(sync.status ?? 1);

  const build = spawnSync(gradle, ["assembleDebug"], {
    cwd: androidDirectory,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);

  const apk = join(
    androidDirectory,
    "app",
    "build",
    "outputs",
    "apk",
    "debug",
    "app-debug.apk",
  );
  const outputDirectory = join(root, "release");
  await mkdir(outputDirectory, { recursive: true });
  await copyFile(apk, join(outputDirectory, "Yemzor.apk"));
  console.log("APK tayyor: release/Yemzor.apk");
}
