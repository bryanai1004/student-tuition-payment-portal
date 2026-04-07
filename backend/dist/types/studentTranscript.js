/**
 * GET /api/students/:studentId/transcript-preview — merged `marks` + `clinic`, titles from `courses`.
 *
 * Domain: response rows are **display-only** transcript history (see `TranscriptRecord` in `domain/studentDomainModels.ts`). Not registration state,
 * not degree audit input, and not authoritative for earned academic units (clinic lines are transcript narrative,
 * not didactic credit — see `domain/studentDomainModels.ts`).
 */
export {};
//# sourceMappingURL=studentTranscript.js.map