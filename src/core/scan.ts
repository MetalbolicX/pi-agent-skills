export type RiskCategory = "network-egress" | "out-of-skill-write" | "privilege-escalation" | "shell-env-mutation";

export interface RiskHit {
  category: RiskCategory;
  evidence: string;
}

/** Scan script text line-by-line using the source project's established detection patterns. */
export function scanContent(content: string): RiskHit[] {
  const hits: RiskHit[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/\b(curl|wget|fetch|openssl|s_client|netcat|nc)\b/.test(trimmed)) hits.push({ category: "network-egress", evidence: line });
    if (/\b(write|put|setContent|WriteFile|mkdir|mv|cp)\b.*[/"'](?!\.)/.test(trimmed)) hits.push({ category: "out-of-skill-write", evidence: line });
    if (/\b(sudo|su |pkexec|doas|chmod [467]|[0-9]{4,})\b/.test(trimmed)) hits.push({ category: "privilege-escalation", evidence: line });
    if (/\b(export|env |source |\..*profile|\.bashrc|\.zshrc|eval)\b/.test(trimmed)) hits.push({ category: "shell-env-mutation", evidence: line });
  }
  return hits;
}
