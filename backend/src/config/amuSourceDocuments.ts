/**
 * Official AMU reference documents stored in the repo for billing, catalog, and scheduling work.
 * Paths are relative to the `backend/` directory.
 *
 * Index: `backend/knowledge/SOURCE_INDEX.md`
 * RAG ingest (PDFs only): `npm run build:knowledge` from `backend/`
 */
export const AMU_SOURCE_DOCUMENTS = {
  /** Primary source for tuition, installments, late fees, and portal payment rules. */
  tuitionPaymentPortal:
    "knowledge/sources/Alhambra_Medical_University_Tuition_Payment_Portal.pdf",
  mahmCatalog2025_26: "knowledge/sources/MAHM_2025-26_Catalog.pdf",
  dahmCatalogJ2026: "knowledge/sources/DAHM_J2026_catalog.pdf",
  amuaaCeuInsuranceSeminar:
    "knowledge/sources/AMUAA_March_CEU_Course_and_Advanced_Insurance_Billing_Small_Group_Seminar.pdf",
  schedules: {
    spring2026English:
      "knowledge/sources/schedules/2026_Spring_English_Class_Schedule_final.docx",
    spring2026Clinic:
      "knowledge/sources/schedules/2026_Spring_Clinic_Schedule_final.docx",
    spring2026Chinese:
      "knowledge/sources/schedules/2026_Spring_Chinese_Class_Schedule_final.docx",
  },
} as const;

export type AmuSourceDocumentKey =
  | "tuitionPaymentPortal"
  | "mahmCatalog2025_26"
  | "dahmCatalogJ2026"
  | "amuaaCeuInsuranceSeminar"
  | "schedules.spring2026English"
  | "schedules.spring2026Clinic"
  | "schedules.spring2026Chinese";

const LABELS: Record<AmuSourceDocumentKey, string> = {
  tuitionPaymentPortal:
    "Alhambra Medical University Tuition Payment Portal (official payment policy)",
  mahmCatalog2025_26: "MAHM 2025–26 Catalog",
  dahmCatalogJ2026: "DAHM J2026 Catalog",
  amuaaCeuInsuranceSeminar:
    "AMUAA March CEU Course and Advanced Insurance Billing Small Group Seminar",
  "schedules.spring2026English": "2026 Spring English Class Schedule (final)",
  "schedules.spring2026Clinic": "2026 Spring Clinic Schedule (final)",
  "schedules.spring2026Chinese": "2026 Spring Chinese Class Schedule (final)",
};

/** Human-readable label for logs, AI context, and policy comments. */
export function describeAmuSourceDocument(key: AmuSourceDocumentKey): string {
  return LABELS[key];
}

/** Resolve a stored document path (under `backend/`) for tooling. */
export function amuSourceDocumentPath(key: AmuSourceDocumentKey): string {
  switch (key) {
    case "tuitionPaymentPortal":
      return AMU_SOURCE_DOCUMENTS.tuitionPaymentPortal;
    case "mahmCatalog2025_26":
      return AMU_SOURCE_DOCUMENTS.mahmCatalog2025_26;
    case "dahmCatalogJ2026":
      return AMU_SOURCE_DOCUMENTS.dahmCatalogJ2026;
    case "amuaaCeuInsuranceSeminar":
      return AMU_SOURCE_DOCUMENTS.amuaaCeuInsuranceSeminar;
    case "schedules.spring2026English":
      return AMU_SOURCE_DOCUMENTS.schedules.spring2026English;
    case "schedules.spring2026Clinic":
      return AMU_SOURCE_DOCUMENTS.schedules.spring2026Clinic;
    case "schedules.spring2026Chinese":
      return AMU_SOURCE_DOCUMENTS.schedules.spring2026Chinese;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
