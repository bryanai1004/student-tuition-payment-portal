import type { KnowledgeChunkRow } from "./ragKnowledge.js";

export type CatalogProgram = "DAHM" | "MAHM";

export type CatalogRetrievalDebug = {
  originalUserQuery: string;
  normalizedRetrievalQuery: string;
  embeddingQueryVariants: string[];
  programHint: CatalogProgram | null;
  topChunks: Array<{
    id: string;
    source: string;
    program?: CatalogProgram | null;
    sectionTitle?: string;
    subsectionTitle?: string;
    pageStart?: number;
    pageEnd?: number;
    score: number;
  }>;
  maxScore: number;
};

const WEAK_RETRIEVAL_MAX_SCORE = 0.22;

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.replace(/\s+/g, " ").trim();
    if (t.length < 2) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Light normalization for logging and a stable retrieval variant. */
export function normalizeCatalogQueryText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?，。；：])/g, "$1")
    .trim();
}

/**
 * Append bilingual keyword bridges so embeddings align across English/Chinese phrasing.
 */
export function expandCatalogQueryForEmbedding(
  question: string,
  rewritten?: string | null,
): string {
  const parts = new Set<string>();
  const bundle = `${question}\n${rewritten ?? ""}`;
  const lower = bundle.toLowerCase();

  const add = (s: string): void => {
    parts.add(s);
  };

  if (/临床|诊\s*所|见习|实习|时数|学时|小时/.test(bundle)) {
    add(
      "clinical training clinical hours clerkship internship practicum clinic hours requirements",
    );
  }
  if (/clinical|clerkship|practicum|internship|clinic\s+hours/i.test(lower)) {
    add("临床训练 临床时数 实习 见习 诊所");
  }
  if (/出席|考勤|出勤|旷课/.test(bundle)) {
    add("attendance policy absence tardy participation");
  }
  if (/\battendance\b|tardy|absence/i.test(lower)) {
    add("出勤 考勤 出席政策");
  }
  if (/退\s*课|退\s*选|加退选|withdraw/.test(bundle)) {
    add("course withdrawal drop policy refund tuition");
  }
  if (/\bwithdraw|drop\s+policy|add\/drop\b/i.test(lower)) {
    add("退课 退选 加退选");
  }
  if (/毕业|学位|学分要求/.test(bundle)) {
    add("graduation requirements degree completion credits");
  }
  if (/\bgraduation\b|\bdegree\s+requirements\b/i.test(lower)) {
    add("毕业要求 学位 学分");
  }
  if (/学费|退款|退费|缴费|付款|截止|deadline|payment/i.test(bundle)) {
    add("tuition refund payment deadline fees installment");
  }
  if (/\btuition\b|\brefund\b|\bpayment\s+deadline\b/i.test(lower)) {
    add("学费 退款 缴费 截止日期");
  }
  if (/针灸|草药|master|硕士|da\s*hm|mahm|dahm/i.test(lower)) {
    add("DAHM MAHM program catalog");
  }

  return Array.from(parts).join(" · ");
}

export function detectCatalogProgramHint(text: string): CatalogProgram | null {
  const u = text.toUpperCase();
  const hasMahm = /\bMAHM\b|\bM\.A\.H\.M\.|\bMASTER\s+OF\s+HERBAL\b|针灸硕士|草药硕士/.test(
    text + u,
  );
  const hasDahm = /\bDAHM\b|\bD\.A\.H\.M\.|\bDOCTOR\s+OF\s+HERBAL\b|针灸博士/.test(
    text + u,
  );
  if (hasMahm && !hasDahm) return "MAHM";
  if (hasDahm && !hasMahm) return "DAHM";
  return null;
}

function programScoreMultiplier(
  chunk: KnowledgeChunkRow,
  hint: CatalogProgram | null,
): number {
  if (!hint || !chunk.program) return 1;
  if (chunk.program === hint) return 1.14;
  return 0.9;
}

export function rankCatalogChunksByEmbeddingMaxWithHint(
  chunks: KnowledgeChunkRow[],
  queryEmbeddings: number[][],
  programHint: CatalogProgram | null,
  cosineSimilarity: (a: number[], b: number[]) => number,
): Array<{ chunk: KnowledgeChunkRow; score: number }> {
  const scored = chunks.map((chunk) => {
    let best = 0;
    for (const qv of queryEmbeddings) {
      const raw = cosineSimilarity(qv, chunk.embedding);
      if (raw > best) best = raw;
    }
    const adjusted = best * programScoreMultiplier(chunk, programHint);
    return { chunk, score: adjusted };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function buildRetrievalQueryVariants(args: {
  originalQuestion: string;
  rewrittenRetrievalQuery: string;
}): { variants: string[]; expansion: string; normalizedRewrite: string } {
  const normalizedRewrite = normalizeCatalogQueryText(
    args.rewrittenRetrievalQuery,
  );
  const expansion = expandCatalogQueryForEmbedding(
    args.originalQuestion,
    normalizedRewrite,
  );
  const o = normalizeCatalogQueryText(args.originalQuestion);
  const variants = uniqueStrings([
    normalizedRewrite,
    o,
    `${normalizedRewrite} ${expansion}`.trim(),
    `${o} ${expansion}`.trim(),
  ]);
  return { variants, expansion, normalizedRewrite };
}

export function selectCatalogChunksForContext(
  ranked: Array<{ chunk: KnowledgeChunkRow; score: number }>,
  options?: { maxChunks?: number; relativeFloor?: number },
): { selected: Array<{ chunk: KnowledgeChunkRow; score: number }>; maxScore: number } {
  const maxChunks = options?.maxChunks ?? 8;
  const relativeFloor = options?.relativeFloor ?? 0.76;
  if (ranked.length === 0) {
    return { selected: [], maxScore: 0 };
  }
  const maxScore = ranked[0]!.score;
  const floor = Math.max(0.06, maxScore * relativeFloor);
  const selected: Array<{ chunk: KnowledgeChunkRow; score: number }> = [];
  for (const row of ranked) {
    if (selected.length >= maxChunks) break;
    if (row.score >= floor) {
      selected.push(row);
      continue;
    }
    if (selected.length < 4) {
      selected.push(row);
      continue;
    }
    break;
  }
  return { selected, maxScore };
}

export function isWeakCatalogRetrieval(maxScore: number): boolean {
  return maxScore < WEAK_RETRIEVAL_MAX_SCORE;
}

export { WEAK_RETRIEVAL_MAX_SCORE };
