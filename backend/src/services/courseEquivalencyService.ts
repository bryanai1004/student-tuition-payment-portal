import { pool, type RowDataPacket } from "../lib/db.js";
import { STATIC_PLACEHOLDER_EQUIVALENCY_PAIRS } from "../data/courseCodePlaceholderEquivalencies.js";
import type { CourseRecord } from "../types/studentAccount.js";

/** Strip spaces/hyphens and uppercase — shared course-code normalization. */
export function normalizeCourseCode(courseCode: string): string {
  return courseCode.replace(/[\s-]+/g, "").trim().toUpperCase();
}

export type CourseEquivalencyIndex = {
  resolveCanonical(courseCode: string): string;
  areEquivalent(a: string, b: string): boolean;
  satisfiesRequirement(studentCode: string, requiredCode: string): boolean;
  /** Normalized codes in the same equivalence class (includes the input code). */
  equivalentCodes(courseCode: string): ReadonlySet<string>;
};

type EquivalencyGraph = {
  parent: Map<string, string>;
  preferredCanonical: Set<string>;
};

function find(parent: Map<string, string>, x: string): string {
  let root = x;
  while (parent.get(root) !== root) {
    root = parent.get(root)!;
  }
  let node = x;
  while (node !== root) {
    const next = parent.get(node)!;
    parent.set(node, root);
    node = next;
  }
  return root;
}

function union(parent: Map<string, string>, a: string, b: string): void {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra === rb) return;
  parent.set(rb, ra);
}

function pickCanonicalForComponent(
  members: Iterable<string>,
  preferredCanonical: Set<string>,
): string {
  const preferred = [...members]
    .filter((code) => preferredCanonical.has(code))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  if (preferred.length > 0) return preferred[0]!;
  return [...members].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))[0]!;
}

function buildEquivalencyGraph(
  pairs: ReadonlyArray<readonly [string, string]>,
  preferredAsCode1: Set<string>,
): EquivalencyGraph {
  const parent = new Map<string, string>();
  const ensure = (code: string): void => {
    if (!parent.has(code)) parent.set(code, code);
  };

  for (const [left, right] of pairs) {
    const a = normalizeCourseCode(left);
    const b = normalizeCourseCode(right);
    if (a === "" || b === "" || a === b) continue;
    ensure(a);
    ensure(b);
    union(parent, a, b);
  }

  return { parent, preferredCanonical: preferredAsCode1 };
}

function buildIndexFromGraph(graph: EquivalencyGraph): CourseEquivalencyIndex {
  const components = new Map<string, Set<string>>();
  for (const code of graph.parent.keys()) {
    const root = find(graph.parent, code);
    const bucket = components.get(root) ?? new Set<string>();
    bucket.add(code);
    components.set(root, bucket);
  }

  const canonicalByCode = new Map<string, string>();
  for (const members of components.values()) {
    const canonical = pickCanonicalForComponent(members, graph.preferredCanonical);
    for (const code of members) {
      canonicalByCode.set(code, canonical);
    }
  }

  const resolveCanonical = (courseCode: string): string => {
    const norm = normalizeCourseCode(courseCode);
    if (norm === "") return norm;
    return canonicalByCode.get(norm) ?? norm;
  };

  return {
    resolveCanonical,
    areEquivalent(a: string, b: string): boolean {
      const na = normalizeCourseCode(a);
      const nb = normalizeCourseCode(b);
      if (na === "" || nb === "") return na === nb;
      if (na === nb) return true;
      return resolveCanonical(na) === resolveCanonical(nb);
    },
    satisfiesRequirement(studentCode: string, requiredCode: string): boolean {
      return resolveCanonical(studentCode) === resolveCanonical(requiredCode);
    },
    equivalentCodes(courseCode: string): ReadonlySet<string> {
      const norm = normalizeCourseCode(courseCode);
      if (norm === "") return new Set<string>();
      const canonical = resolveCanonical(norm);
      const out = new Set<string>([norm]);
      for (const [code, canon] of canonicalByCode) {
        if (canon === canonical) out.add(code);
      }
      return out;
    },
  };
}

/** Identity index — used when DB is unavailable; no cross-code matching. */
export function createIdentityEquivalencyIndex(): CourseEquivalencyIndex {
  return buildIndexFromGraph(buildEquivalencyGraph([], new Set()));
}

async function loadDbEquivalencyPairs(): Promise<{
  pairs: Array<[string, string]>;
  preferredAsCode1: Set<string>;
}> {
  const pairs: Array<[string, string]> = [];
  const preferredAsCode1 = new Set<string>();

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TRIM(code1) AS code1, TRIM(code2) AS code2
       FROM courses_equivalency
       WHERE TRIM(code1) <> '' AND TRIM(code2) <> ''`,
    );
    for (const row of rows) {
      const code1 = String(row.code1 ?? "").trim();
      const code2 = String(row.code2 ?? "").trim();
      if (code1 === "" || code2 === "") continue;
      pairs.push([code1, code2]);
      preferredAsCode1.add(normalizeCourseCode(code1));
    }
  } catch (e) {
    console.warn("[course-equivalency] courses_equivalency load failed; using static pairs only", e);
  }

  for (const [code1, code2] of STATIC_PLACEHOLDER_EQUIVALENCY_PAIRS) {
    pairs.push([code1, code2]);
    preferredAsCode1.add(normalizeCourseCode(code1));
  }

  return { pairs, preferredAsCode1 };
}

export async function loadCourseEquivalencyIndex(): Promise<CourseEquivalencyIndex> {
  const { pairs, preferredAsCode1 } = await loadDbEquivalencyPairs();
  const graph = buildEquivalencyGraph(pairs, preferredAsCode1);
  return buildIndexFromGraph(graph);
}

let cachedIndex: CourseEquivalencyIndex | null = null;
let cachedAtMs = 0;
const CACHE_TTL_MS = 60_000;

/** Cached loader for hot paths (graduation, progress, academics merge). */
export async function getCourseEquivalencyIndex(): Promise<CourseEquivalencyIndex> {
  const now = Date.now();
  if (cachedIndex != null && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedIndex;
  }
  cachedIndex = await loadCourseEquivalencyIndex();
  cachedAtMs = now;
  return cachedIndex;
}

/** For tests — reset module cache. */
export function clearCourseEquivalencyCache(): void {
  cachedIndex = null;
  cachedAtMs = 0;
}

/** Test helper — build an index from explicit pairs without DB. */
export function buildCourseEquivalencyIndexFromPairs(
  pairs: ReadonlyArray<readonly [string, string]>,
): CourseEquivalencyIndex {
  const preferred = new Set<string>();
  for (const [code1] of pairs) {
    preferred.add(normalizeCourseCode(code1));
  }
  const graph = buildEquivalencyGraph(pairs, preferred);
  return buildIndexFromGraph(graph);
}

function pickRepresentativeCourseRecord(
  candidates: CourseRecord[],
  canonicalCode: string,
): CourseRecord {
  if (candidates.length === 0) {
    throw new Error("pickRepresentativeCourseRecord requires at least one candidate");
  }
  const exact = candidates.find(
    (c) => normalizeCourseCode(c.courseCode) === canonicalCode,
  );
  if (exact != null) return exact;

  const portalBacked = candidates.find((c) => !c.courseId.startsWith("MAHM"));
  if (portalBacked != null) return portalBacked;

  return candidates.reduce((best, cur) => {
    const bestUnits = typeof best.units === "number" ? best.units : 0;
    const curUnits = typeof cur.units === "number" ? cur.units : 0;
    return curUnits > bestUnits ? cur : best;
  });
}

/**
 * Collapse parallel legacy / PDF / placeholder catalog rows to one entry per equivalence class.
 * Required credits and course lists should use the returned map.
 */
export function collapseCatalogToCanonicalMap(
  catalog: Map<string, CourseRecord>,
  index: CourseEquivalencyIndex,
): Map<string, CourseRecord> {
  const grouped = new Map<string, CourseRecord[]>();

  for (const rec of catalog.values()) {
    const norm = normalizeCourseCode(rec.courseCode);
    if (norm === "") continue;
    const canonical = index.resolveCanonical(norm);
    const list = grouped.get(canonical) ?? [];
    list.push(rec);
    grouped.set(canonical, list);
  }

  const out = new Map<string, CourseRecord>();
  for (const [canonical, candidates] of grouped) {
    out.set(canonical, pickRepresentativeCourseRecord(candidates, canonical));
  }
  return out;
}

export function requiredCourseCodesFromCanonicalCatalog(
  catalog: Map<string, CourseRecord>,
): string[] {
  const out: string[] = [];
  for (const rec of catalog.values()) {
    if (rec.type === "clinical") continue;
    const code = rec.courseCode.trim().toUpperCase();
    if (code === "") continue;
    out.push(code);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

export function sumRequiredQuarterUnitsFromCatalog(catalog: Map<string, CourseRecord>): number {
  let total = 0;
  for (const c of catalog.values()) {
    if (c.type === "clinical") continue;
    if (typeof c.units === "number" && Number.isFinite(c.units)) {
      total += c.units;
    }
  }
  return Math.round(total * 100) / 100;
}
