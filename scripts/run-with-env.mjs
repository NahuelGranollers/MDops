import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    if (key === "NODE_ENV") continue;
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://md_ops:md_ops_dev_password@localhost:5432/md_ops?schema=public";
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Uso: node scripts/run-with-env.mjs <comando> [...args]");
  process.exit(1);
}

const env = withToolchainPath(process.env);
const resolved = resolveCommand(command, args, env);

const child = spawn(resolved.command, resolved.args, {
  stdio: "inherit",
  shell: false,
  env
});

child.on("error", (error) => {
  console.error(`No se ha podido ejecutar ${command}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 1));

function withToolchainPath(baseEnv) {
  const env = { ...baseEnv };
  if (process.platform !== "win32") return env;

  const pathKey = getPathKey(env);
  const pathParts = (env[pathKey] ?? "").split(delimiter).filter(Boolean);
  const seen = new Set(pathParts.map((part) => part.toLowerCase()));
  const additions = [
    env.APPDATA ? join(env.APPDATA, "npm") : null,
    env.ProgramFiles ? join(env.ProgramFiles, "nodejs") : null,
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs", "nodejs") : null
  ];

  for (const dir of additions) {
    if (!dir || !existsSync(dir)) continue;
    const key = dir.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pathParts.unshift(dir);
  }

  env[pathKey] = pathParts.join(delimiter);
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT ??= "0";
  env.PRISMA_HIDE_UPDATE_MESSAGE ??= "1";
  return env;
}

function resolveCommand(command, args, env) {
  if (process.platform === "win32" && command === "pnpm") {
    const npmExecPath = env.npm_execpath;
    if (npmExecPath && /pnpm/i.test(npmExecPath) && existsSync(npmExecPath)) {
      if (/\.(?:cjs|mjs|js)$/i.test(npmExecPath)) {
        return { command: process.execPath, args: [npmExecPath, ...args] };
      }
      return commandSpec(npmExecPath, args, env);
    }

    const pnpmPath = findCommand("pnpm", env);
    if (pnpmPath) return commandSpec(pnpmPath, args, env);

    const corepackPath = findCommand("corepack", env);
    if (corepackPath) return commandSpec(corepackPath, ["pnpm", ...args], env);
  }

  const resolvedPath = process.platform === "win32" ? findCommand(command, env) : null;
  return commandSpec(resolvedPath ?? command, args, env);
}

function commandSpec(command, args, env) {
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)) {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/c", "call", command, ...args]
    };
  }

  return { command, args };
}

function findCommand(command, env) {
  const hasPath = /[\\/]/.test(command);
  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const hasExtension = /\.[^\\/]+$/.test(command);
  const pathParts = hasPath ? [""] : (env[getPathKey(env)] ?? "").split(delimiter);

  for (const dir of pathParts) {
    for (const extension of hasExtension ? [""] : extensions) {
      const candidate = dir ? join(dir, command + extension.toLowerCase()) : command + extension.toLowerCase();
      if (existsSync(candidate)) return candidate;
      const originalCaseCandidate = dir ? join(dir, command + extension) : command + extension;
      if (existsSync(originalCaseCandidate)) return originalCaseCandidate;
    }
  }

  return null;
}

function getPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}
