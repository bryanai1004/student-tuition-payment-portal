import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export type CatalogProgram = "DAHM" | "MAHM";

export type CatalogChunkDraft = {
  sourceRelative: string;
  chunkIndex: number;
  program: CatalogProgram | null;
  sectionTitle: string;
  subsectionTitle: string;
  pageStart: number;
  pageEnd: number;
  /** Human-readable excerpt for the LLM */
  content: string;
  /** Text embedded for vector search (includes structured labels) */
  embedText: string;
};

const NOISE_LINE_PATTERNS: RegExp[] = [
  /^\s*page\s+\d+\s*$/i,
  /^\s*\d{1,4}\s*$/,
  /^\s*alhambra\s+medical\s+university\s*$/i,
  /^\s*amu\s*$/i,
];

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\u00a0\t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripRepeatedHeaders(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let last = "";
  for (const line of lines) {
    const t = line.trim();
    if (t.length === 0) {
      out.push("");
      continue;
    }
    if (NOISE_LINE_PATTERNS.some((re) => re.test(t))) continue;
    const key = t.toLowerCase();
    if (key === last && t.length < 80) continue;
    last = key;
    out.push(line);
  }
  return out.join("\n");
}

export function inferProgramFromPdfPath(relativePath: string): CatalogProgram | null {
  const base = relativePath.split(/[/\\]/).pop() ?? relativePath;
  if (/\bMAHM\b/i.test(base)) return "MAHM";
  if (/\bDAHM\b/i.test(base)) return "DAHM";
  return null;
}

function looksLikeNumberedHeading(block: string): boolean {
  const s = block.trim().split("\n")[0] ?? "";
  return (
    /^\d+(\.\d+){1,4}\s+\S/.test(s) ||
    /^(chapter|section|appendix|table)\s+\d+/i.test(s)
  );
}

function looksLikeChineseHeading(block: string): boolean {
  const s = block.trim().split("\n")[0] ?? "";
  return /^第[一二三四五六七八九十百零〇0-9]+(章|节|部分)/.test(s);
}

function looksLikeAllCapsHeading(block: string): boolean {
  const s = block.trim().split("\n")[0] ?? "";
  if (s.length < 4 || s.length > 90) return false;
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 5) return false;
  return letters === letters.toUpperCase();
}

function looksLikeShortTitle(block: string): boolean {
  const s = block.trim().split("\n")[0] ?? "";
  if (s.length < 6 || s.length > 110) return false;
  if (/[.!?。！？]$/.test(s)) return false;
  if (block.includes("\n") && block.length > 140) return false;
  const words = s.split(/\s+/).length;
  if (words <= 14 && /^[A-Z]/.test(s)) return true;
  return false;
}

function headingKind(block: string): "section" | "subsection" | null {
  const t = block.trim();
  if (t.length === 0 || t.length > 200) return null;
  if (looksLikeChineseHeading(block)) return "section";
  if (looksLikeNumberedHeading(block)) {
    const first = t.split("\n")[0] ?? "";
    return /^\d+\.\d+/.test(first) ? "subsection" : "section";
  }
  if (looksLikeAllCapsHeading(block)) return "section";
  if (looksLikeShortTitle(block)) return "subsection";
  return null;
}

type PagePiece = { pageNum: number; text: string };

async function extractPagesFromPdf(absPath: string): Promise<PagePiece[]> {
  const data = await readFile(absPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const pages = result.pages ?? [];
    if (pages.length > 0) {
      return pages.map((p) => ({
        pageNum: p.num,
        text: normalizeWhitespace(stripRepeatedHeaders(p.text ?? "")),
      }));
    }
    const fallback = normalizeWhitespace(stripRepeatedHeaders(result.text ?? ""));
    return fallback ? [{ pageNum: 1, text: fallback }] : [];
  } finally {
    await parser.destroy();
  }
}

function makeEmbedText(
  program: CatalogProgram | null,
  sectionTitle: string,
  subsectionTitle: string,
  pageStart: number,
  pageEnd: number,
  body: string,
): string {
  const bits: string[] = [];
  if (program) bits.push(`Program: ${program}.`);
  if (sectionTitle) bits.push(`Section: ${sectionTitle}.`);
  if (subsectionTitle) bits.push(`Subsection: ${subsectionTitle}.`);
  bits.push(`Pages: ${pageStart}${pageEnd !== pageStart ? `–${pageEnd}` : ""}.`);
  bits.push("Catalog excerpt:", body);
  return bits.join("\n");
}

function makeDisplayContent(
  program: CatalogProgram | null,
  sectionTitle: string,
  subsectionTitle: string,
  pageStart: number,
  pageEnd: number,
  body: string,
): string {
  const labelParts: string[] = [];
  if (program) labelParts.push(`${program} catalog`);
  if (sectionTitle) labelParts.push(sectionTitle);
  if (subsectionTitle) labelParts.push(subsectionTitle);
  const pageBit =
    pageStart === pageEnd ? `p. ${pageStart}` : `pp. ${pageStart}–${pageEnd}`;
  const header =
    labelParts.length > 0
      ? `[${labelParts.join(" | ")} | ${pageBit}]\n\n`
      : `[${pageBit}]\n\n`;
  return `${header}${body}`;
}

type StreamEvent =
  | { kind: "h_section"; text: string; page: number }
  | { kind: "h_subsection"; text: string; page: number }
  | { kind: "body"; text: string; page: number };

const TARGET_MIN = 480;
const TARGET_MAX = 1650;
const HARD_MAX = 2100;

function splitOversizedBody(text: string): string[] {
  const t = text.trim();
  if (t.length <= HARD_MAX) return [t];
  const parts: string[] = [];
  let start = 0;
  while (start < t.length) {
    const end = Math.min(start + HARD_MAX, t.length);
    let slice = t.slice(start, end);
    if (end < t.length) {
      const breakZh = slice.lastIndexOf("。");
      const breakEn = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("? "),
      );
      const cut = Math.max(breakZh, breakEn);
      if (cut > TARGET_MIN) {
        slice = t.slice(start, start + cut + 1);
        start += cut + 1;
      } else {
        start = end;
      }
    } else {
      start = end;
    }
    const piece = slice.trim();
    if (piece.length >= 40) parts.push(piece);
  }
  return parts.length > 0 ? parts : [t];
}

function buildStreamEvents(pages: PagePiece[]): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const { pageNum, text } of pages) {
    if (!text) continue;
    const blocks = text
      .split(/\n\n+/)
      .map((b) => normalizeWhitespace(b))
      .filter((b) => b.length > 0);
    for (const block of blocks) {
      const hk = headingKind(block);
      if (hk === "section") {
        events.push({ kind: "h_section", text: block.trim(), page: pageNum });
        continue;
      }
      if (hk === "subsection") {
        events.push({
          kind: "h_subsection",
          text: block.trim(),
          page: pageNum,
        });
        continue;
      }
      for (const piece of splitOversizedBody(block)) {
        events.push({ kind: "body", text: piece, page: pageNum });
      }
    }
  }
  return events;
}

function joinedLen(parts: string[]): number {
  return parts.join("\n\n").length;
}

/**
 * Page-aware, heading-aware chunking for AMU catalog PDFs.
 */
export async function draftChunksFromPdf(options: {
  absolutePath: string;
  sourceRelative: string;
}): Promise<CatalogChunkDraft[]> {
  const pages = await extractPagesFromPdf(options.absolutePath);
  const program = inferProgramFromPdfPath(options.sourceRelative);
  const stream = buildStreamEvents(pages);

  let sectionTitle = "";
  let subsectionTitle = "";
  const buf: string[] = [];
  const bufPages: number[] = [];
  const out: CatalogChunkDraft[] = [];

  const flush = (): void => {
    const body = normalizeWhitespace(buf.join("\n\n"));
    if (body.length < 70) {
      buf.length = 0;
      bufPages.length = 0;
      return;
    }
    const pageStart = Math.min(...bufPages);
    const pageEnd = Math.max(...bufPages);
    const embedText = makeEmbedText(
      program,
      sectionTitle,
      subsectionTitle,
      pageStart,
      pageEnd,
      body,
    );
    const content = makeDisplayContent(
      program,
      sectionTitle,
      subsectionTitle,
      pageStart,
      pageEnd,
      body,
    );
    out.push({
      sourceRelative: options.sourceRelative,
      chunkIndex: out.length,
      program,
      sectionTitle,
      subsectionTitle,
      pageStart,
      pageEnd,
      content,
      embedText,
    });
    buf.length = 0;
    bufPages.length = 0;
  };

  for (const ev of stream) {
    if (ev.kind === "h_section") {
      if (joinedLen(buf) >= TARGET_MIN) flush();
      sectionTitle = ev.text;
      subsectionTitle = "";
      continue;
    }
    if (ev.kind === "h_subsection") {
      if (joinedLen(buf) >= TARGET_MIN) flush();
      subsectionTitle = ev.text;
      continue;
    }
    buf.push(ev.text);
    bufPages.push(ev.page);
    if (joinedLen(buf) >= TARGET_MAX) flush();
  }
  flush();

  return out.map((c, i) => ({ ...c, chunkIndex: i }));
}
