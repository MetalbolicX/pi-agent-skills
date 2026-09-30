export const REGISTRY_LATEST_URL = "https://registry.npmjs.org/pi-agent-skills/latest";
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/; // Build metadata is excluded to keep emitted version hints canonical.

export async function fetchLatestVersion({ fetch: fetchImpl = fetch, timeoutMs = 3000 }: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    let onTimeout: (() => void) | undefined;
    // AbortSignal.timeout is passed to fetch, but injected fetch implementations may ignore it; race explicitly so header acquisition still fails soft on time.
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
    // timeoutMs bounds fetch/header acquisition only; response.json() body reading is outside this race.
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || typeof (value as { version?: unknown }).version !== "string") return null;
    const { version } = value as { version: string };
    return VERSION_PATTERN.test(version) ? version : null;
  } catch {
    return null;
  }
}

function semver(value: string): [number, number, number] | undefined {
  // Preserve the accepted upstream-style behavior: compare numeric cores, so prereleases of a release are not marked stale against that release.
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
