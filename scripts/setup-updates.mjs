// Turns on auto-update, once: `npm run updates:setup -- owner/repo`.
// Makes a signing key outside the project (so it can never be committed), and points the app at the
// latest GitHub release. Builds made after this sign their installers, and Settings can update.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const repo = process.argv[2];
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) {
  console.error("Usage: npm run updates:setup -- owner/repo   (the GitHub repo whose Releases hold the installers)");
  process.exit(1);
}

const keyDir = join(homedir(), ".tauri");
const key = join(keyDir, "daiku-updater.key");
if (existsSync(key)) {
  console.log(`Using the existing key at ${key}. Delete it first to make a new one; older installs then can't update.`);
} else {
  mkdirSync(keyDir, { recursive: true });
  execFileSync("npx", ["tauri", "signer", "generate", "--ci", "-w", key], { stdio: "inherit", shell: true });
}

const conf = "src-tauri/tauri.conf.json";
const config = JSON.parse(readFileSync(conf, "utf8"));
config.bundle.createUpdaterArtifacts = true;
config.plugins = {
  ...config.plugins,
  updater: {
    pubkey: readFileSync(`${key}.pub`, "utf8").trim(),
    endpoints: [`https://github.com/${repo}/releases/latest/download/latest.json`],
    windows: { installMode: "passive" },
  },
};
writeFileSync(conf, JSON.stringify(config, null, 2) + "\n");

console.log(`
Updates now come from https://github.com/${repo}/releases.

Two things left, on GitHub (Settings > Secrets and variables > Actions > New repository secret):
  TAURI_SIGNING_PRIVATE_KEY           the contents of ${key}
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD  leave empty

Then push a version tag (git tag v0.2.0 && git push --tags). The release is made as a draft:
publish it, and every Daiku built from now on finds it under Settings > Check for updates.
Keep the key safe. Without it, installed copies can't be updated again.`);
