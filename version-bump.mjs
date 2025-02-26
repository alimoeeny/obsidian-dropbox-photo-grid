import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.argv[2];
const minAppVersion = process.argv[3];

// read minAppVersion from manifest.json if it's not provided
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion: currentMinAppVersion } = manifest;

// Update manifest.json
manifest.version = targetVersion;
if (minAppVersion) {
  manifest.minAppVersion = minAppVersion;
}
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));

// Update versions.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion || currentMinAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2));

console.log(`Updated version to ${targetVersion} with minimum app version ${minAppVersion || currentMinAppVersion}`);
