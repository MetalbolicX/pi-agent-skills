export function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j] ?? j;
      previous[j] = Math.min(above + 1, (previous[j - 1] ?? j) + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length] ?? 0;
}

export function findClosestMatch(input: string, candidates: readonly string[]): string | null {
  if (candidates.length === 0) return null;
  const needle = input.toLowerCase();
  let best: string | null = null;
  let score = 0;
  for (const candidate of candidates) {
    const value = candidate.toLowerCase();
    let current: number;
    if (value.startsWith(needle)) current = 0.9 + (needle.length / value.length) * 0.1;
    else if (needle.startsWith(value)) current = 0.8;
    else if (value.includes(needle) || needle.includes(value)) current = 0.7;
    else current = 1 - levenshtein(needle, value) / Math.max(needle.length, value.length);
    if (current > score) { score = current; best = candidate; }
  }
  return score >= 0.4 ? best : null;
}

export function resolveSkillName(name: string, skills: ReadonlyMap<string, { path: string; relativePath: string }>): string | null {
  if (skills.has(name)) return name;
  const isSegmentSuffix = (value: string): boolean => {
    if (value === name || !value.endsWith(name)) return value === name;
    const separator = value[value.length - name.length - 1];
    return separator === "/" || separator === "\\";
  };
  const suffixes = [...skills].filter(([, skill]) => isSegmentSuffix(skill.path) || isSegmentSuffix(skill.relativePath)).map(([key]) => key);
  if (suffixes.length === 1) return suffixes[0] ?? null;
  if (suffixes.length > 1) throw new Error(`Ambiguous skill name '${name}' — multiple candidates: ${suffixes.join(", ")}`);
  return findClosestMatch(name, [...skills.keys()]);
}
