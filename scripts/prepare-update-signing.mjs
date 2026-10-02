import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const secretDir = resolve(root, ".secrets");
const keyPath = resolve(secretDir, "update-private.key");
mkdirSync(secretDir, { recursive: true });

if (existsSync(keyPath)) {
  console.log(`Update private key already exists: ${keyPath}`);
  console.log("The existing key was preserved.");
  process.exit(0);
}

console.log("Generating a NEW AI RDvD updater signing key locally...");
console.log("The private key stays in .secrets and is never written to source files.");

// Use the Bun runtime and the project-installed Tauri CLI directly.
// The empty password is explicit so key generation remains non-interactive.
const command = process.platform === "win32" ? "bun.exe" : "bun";
const result = spawnSync(command, ["tauri", "signer", "generate", "--ci", "-w", keyPath], {
  cwd: root,
  stdio: "pipe",
  encoding: "utf8",
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" },
});

const stdout = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(stdout);

if (result.status !== 0 || !existsSync(keyPath)) {
  console.error("Updater key generation failed.");
  console.error(`Command exit code: ${result.status ?? "unknown"}`);
  if (result.error) {
    console.error(`Process error: ${result.error.message}`);
  }
  process.exit(result.status ?? 1);
}

const publicKeyMatch = stdout.match(/Public Key:\s*([^\r\n]+)/i);
if (!publicKeyMatch) {
  console.error("Could not parse the public key from Tauri CLI output.");
  console.error(`Private key was created at: ${keyPath}`);
  process.exit(2);
}

const publicKey = publicKeyMatch[1].trim();
const configPath = resolve(root, "src-tauri", "tauri.conf.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
config.plugins ??= {};
config.plugins.updater ??= {};
config.plugins.updater.pubkey = publicKey;
config.plugins.updater.endpoints = [
  "https://github.com/anhbaokr/ai-rdvd-ui/releases/latest/download/latest.json",
];
config.plugins.updater.windows = { installMode: "passive" };
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(`Public key configured in ${configPath}`);
console.log(`Private key: ${keyPath}`);
console.log("KEEP THE UPDATE PRIVATE KEY OUT OF GIT/GITHUB.");
