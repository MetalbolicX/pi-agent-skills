import * as fs from "node:fs/promises";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { discoverScripts, isRegisteredScript } from "../core/scripts.js";
import { scanContent } from "../core/scan.js";
import type { AdapterConfig } from "./config.js";
import type { SkillStore } from "../core/types.js";

export interface ExecResult {
  status: "completed" | "denied" | "timeout" | "failed";
  output: string;
}
interface ApprovalContext {
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
}
type Spawn = typeof nodeSpawn;
const OUTPUT_LIMIT = 64 * 1024;

function appendLimited(current: string, chunk: Buffer): string {
  if (current.length >= OUTPUT_LIMIT) return current;
  return current + chunk.toString("utf8").slice(0, OUTPUT_LIMIT - current.length);
}

export async function executeSkillScript(
  store: SkillStore,
  config: AdapterConfig,
  skillName: string,
  scriptName: string,
  args: string[],
  context: ApprovalContext,
  signal?: AbortSignal,
  spawn: Spawn = nodeSpawn,
): Promise<ExecResult> {
  const skill = await store.resolve(skillName);
  const registry = await discoverScripts(skill.skillDir);
  const script = registry.find((item) => item.relativePath === scriptName || item.absolutePath === scriptName);
  if (!script || !isRegisteredScript(registry, script.absolutePath) || !path.isAbsolute(script.absolutePath)) {
    return { status: "denied", output: `Script '${scriptName}' is not registered for skill '${skillName}'.` };
  }
  const content = await fs.readFile(script.absolutePath, "utf8");
  const risks = scanContent(content);
  if (risks.length > 0) {
    const evidence = risks.map((risk) => `${risk.category}: ${risk.evidence}`).join("\n");
    if (!context.hasUI) return { status: "denied", output: `Execution denied: approval UI is unavailable. Risks detected:\n${evidence}` };
    const approved = await context.ui.confirm("Approve skill script", `Run ${skillName}/${script.relativePath}?\n\n${evidence}`);
    if (!approved) return { status: "denied", output: `Execution denied by user. Risks detected:\n${evidence}` };
  }
  if (signal?.aborted) return { status: "failed", output: "Execution aborted before start." };

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let child: ChildProcess;
    const controller = new AbortController();
    const abortChild = (): void => { child.kill("SIGKILL"); };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, config.scriptTimeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    controller.signal.addEventListener("abort", abortChild, { once: true });
    try {
      child = spawn(script.absolutePath, args, { cwd: skill.skillDir, signal: controller.signal, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve({ status: "failed", output: String(error) });
      return;
    }
    child.stdout?.on("data", (chunk: Buffer) => { stdout = appendLimited(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = appendLimited(stderr, chunk); });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve({ status: timedOut ? "timeout" : "failed", output: `${stdout}${stderr}\n${timedOut ? "Script timed out." : String(error)}` });
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve({ status: timedOut ? "timeout" : code === 0 ? "completed" : "failed", output: `${stdout}${stderr}${timedOut ? "\nScript timed out." : `\nExit code: ${String(code)}`}` });
    });
  });
}
