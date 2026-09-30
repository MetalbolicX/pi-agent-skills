export interface AdapterConfig {
  roots: string[] | undefined;
  scriptTimeoutMs: number;
  debug: boolean;
}

export type Environment = Record<string, string | undefined>;

export type DebugLogger = (line: string) => void;

export function createDebugLogger(enabled: boolean, sink: (line: string) => void = console.warn): DebugLogger {
  if (!enabled) return () => {};
  return (line) => sink(`[pi-skills] ${line}`);
}

export function parseConfig(env: Environment): AdapterConfig {
  const rootsValue = env.PI_SKILLS_ROOTS;
  const roots = rootsValue?.trim()
    ? rootsValue.split(":").map((root) => root.trim()).filter(Boolean)
    : undefined;
  const timeoutValue = env.PI_SKILLS_SCRIPT_TIMEOUT_MS;
  const parsedTimeout = timeoutValue === undefined || timeoutValue.trim() === "" ? Number.NaN : Number(timeoutValue);
  const scriptTimeoutMs = Number.isSafeInteger(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30_000;
  const debug = /^(1|true|yes|on)$/i.test(env.PI_SKILLS_DEBUG?.trim() ?? "");
  return { roots, scriptTimeoutMs, debug };
}

export function fromEnv(): AdapterConfig {
  return parseConfig(process.env);
}
