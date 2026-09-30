import { spawn } from "node:child_process";
import { DEBUG, debug } from "./debug.js";

export interface RunPiOptions {
  argv: string[];
  timeoutMs?: number;
  dryRun?: boolean;
  capture?: boolean;
}

export interface RunPiResult {
  exitCode: number;
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export function runPi({ argv, timeoutMs = 30_000, dryRun = false, capture = false }: RunPiOptions): Promise<RunPiResult> {
  if (dryRun) {
    console.log(`[dry-run] Would run: pi ${argv.join(" ")}`);
    return Promise.resolve({ exitCode: 0, success: true });
  }

  if (DEBUG.test(process.env.PI_SKILLS_DEBUG?.trim() ?? "")) {
    debug(console.error, `spawning: pi ${argv.join(" ")}`);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    const child = spawn("pi", argv, {
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    const finish = (result: RunPiResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    if (capture) {
      child.stdout?.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
      child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish({ exitCode: 1, success: false, stdout: capture ? stdout : undefined, stderr: capture ? stderr : undefined, error: `pi CLI timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.once("error", (error: NodeJS.ErrnoException) => {
      const { code, message } = error;
      if (code === "ENOENT") {
        const message = "pi CLI not found on PATH";
        console.error(message);
        finish({ exitCode: 1, success: false, stdout: capture ? stdout : undefined, stderr: capture ? stderr : undefined, error: message });
        return;
      }
      console.error(message);
      finish({ exitCode: 1, success: false, stdout: capture ? stdout : undefined, stderr: capture ? stderr : undefined, error: message });
    });

    child.once("close", (code) => {
      if (timedOut) return;
      const exitCode = code ?? 1;
      finish({ exitCode, success: exitCode === 0, stdout: capture ? stdout : undefined, stderr: capture ? stderr : undefined });
    });
  });
}
