/**
 * Demo / static MAHM catalog codes (`mahmCatalog.ts`) paired with registrar PDF codes.
 * Supplements `courses_equivalency` for #18 — requirement matching and catalog dedupe only;
 * enrollments and marks keep their stored codes.
 *
 * code1 = preferred canonical (PDF / portal curriculum); code2 = placeholder / legacy alias.
 */
export const STATIC_PLACEHOLDER_EQUIVALENCY_PAIRS: ReadonlyArray<
  readonly [code1: string, code2: string]
> = [
  ["OM111", "TCM101"],
  ["HB202", "HERB202"],
  ["AC111", "POI201"],
  ["AC112", "POI202"],
  ["OM201", "DXM201"],
  ["WM401", "BIO201"],
  ["WM402", "BIO202"],
  ["RM400", "RES301"],
];
