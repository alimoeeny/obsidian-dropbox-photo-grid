import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const targetVersion = process.argv[2];
const minAppVersion = process.argv[3];
const distDir = "dist";

// Read package.json
const packageJsonPath = "package.json";
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// read minAppVersion from manifest.json if it's not provided
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion: currentMinAppVersion } = manifest;

// Update manifest.json
manifest.version = targetVersion;
if (minAppVersion) {
  manifest.minAppVersion = minAppVersion;
}
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));

// Update package.json
packageJson.version = targetVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// Update versions.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion || currentMinAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2));

// Copy files to the dist directory
try {
  copyFileSync("manifest.json", join(distDir, "manifest.json"));
  copyFileSync("versions.json", join(distDir, "versions.json"));
  console.log(`Copied manifest.json and versions.json to ${distDir}/`);
} catch (err) {
  console.error("Error copying files to dist directory:", err);
}

console.log(`Updated version to ${targetVersion} with minimum app version ${minAppVersion || currentMinAppVersion}`);
