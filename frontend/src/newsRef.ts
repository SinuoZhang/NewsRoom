function toUtcDate(value: string | null): Date | null {
  if (!value) return null;
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(value);
  const iso = hasZone ? value : `${value}Z`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function shortHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().slice(0, 6).padStart(6, "0");
}

export function makeNewsRef(params: {
  sourceName: string;
  title: string;
  publishedAt: string | null;
  collectedAt?: string | null;
  fallbackId?: number;
}): string {
  const dt = toUtcDate(params.publishedAt) || toUtcDate(params.collectedAt || null) || new Date(0);
  const y = String(dt.getUTCFullYear()).slice(-2);
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const ts = `${y}${m}${d}${hh}${mm}`;

  const sourceCode = (params.sourceName || "SRC").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6) || "SRC";
  const hashSeed = `${params.sourceName}|${params.title}|${params.publishedAt || ""}|${params.collectedAt || ""}|${params.fallbackId || 0}`;
  return `${ts}-${sourceCode}-${shortHash(hashSeed)}`;
}
