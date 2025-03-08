import { readFileSync } from "fs";
import { execSync } from "child_process";

// Read the current version from package.json
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const currentVersion = packageJson.version;

// Parse the version components
const [major, minor, patch] = currentVersion.split(".").map(Number);

// Increment the patch version
const newPatch = patch + 1;
const newVersion = `${major}.${minor}.${newPatch}`;

console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

// Run the version-bump script with the new version
try {
    execSync(`node version-bump.mjs ${newVersion}`, { stdio: 'inherit' });
    console.log(`Successfully bumped version to ${newVersion}`);
} catch (error) {
    console.error("Error bumping version:", error);
    process.exit(1);
}
