export const REGISTRY_LATEST_URL = "https://registry.npmjs.org/pi-agent-skills/latest";

export async function fetchLatestVersion({ fetch: fetchImpl = fetch, timeoutMs = 3000 }: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    let onTimeout: (() => void) | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      onTimeout = () => reject(signal.reason);
      signal.addEventListener("abort", onTimeout, { once: true });
    });
    let response: Response;
    try {
      response = await Promise.race([fetchImpl(REGISTRY_LATEST_URL, { signal }), timeout]);
    } finally {
      if (onTimeout) signal.removeEventListener("abort", onTimeout);
    }
    if (!response.ok) return null;
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || typeof (value as { version?: unknown }).version !== "string") return null;
    return (value as { version: string }).version;
  } catch {
    return null;
  }
}

function semver(value: string): [number, number, number] | undefined {
  const [core] = value.split("-", 1);
  if (!core || !/^\d+\.\d+\.\d+$/.test(core)) return undefined;
  const parts = core.split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return undefined;
  const [major, minor, patch] = parts;
  return [major!, minor!, patch!];
}

export function compareSemver(a: string, b: string): number {
  const left = semver(a);
  const right = semver(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! !== right[index]!) return left[index]! < right[index]! ? -1 : 1;
  }
  return 0;
}

export function isStale(installed: string, latest: string): boolean {
  if (!semver(installed) || !semver(latest)) return false;
  return compareSemver(latest, installed) > 0;
}
