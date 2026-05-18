# AMU official source documents

These files are the **authoritative references** for portal billing, catalogs, schedules, and AI/RAG answers. They were provided May 2026 and copied from staff Downloads into this repo.

**Code registry:** `backend/src/config/amuSourceDocuments.ts`  
**RAG rebuild (PDFs only):** from `backend/`, run `npm run build:knowledge` (requires `OPENAI_API_KEY`).

## Catalogs

| File | Use |
|------|-----|
| [`sources/MAHM_2025-26_Catalog.pdf`](sources/MAHM_2025-26_Catalog.pdf) | MAHM program courses, units, graduation structure |
| [`sources/DAHM_J2026_catalog.pdf`](sources/DAHM_J2026_catalog.pdf) | DAHM program catalog (J2026) |

## Payment & billing

| File | Use |
|------|-----|
| [`sources/Alhambra_Medical_University_Tuition_Payment_Portal.pdf`](sources/Alhambra_Medical_University_Tuition_Payment_Portal.pdf) | **Primary** — tuition rates, installment rules, late fees, portal payment flows |

Portal code references this document in `paymentCalculationPolicy.ts` and `billingMath.ts` constants.

## Professional development

| File | Use |
|------|-----|
| [`sources/AMUAA_March_CEU_Course_and_Advanced_Insurance_Billing_Small_Group_Seminar.pdf`](sources/AMUAA_March_CEU_Course_and_Advanced_Insurance_Billing_Small_Group_Seminar.pdf) | CEU / insurance billing seminar (AMUAA) |

## 2026 Spring schedules (Word)

| File | Use |
|------|-----|
| [`sources/schedules/2026_Spring_English_Class_Schedule_final.docx`](sources/schedules/2026_Spring_English_Class_Schedule_final.docx) | Didactic English sections |
| [`sources/schedules/2026_Spring_Clinic_Schedule_final.docx`](sources/schedules/2026_Spring_Clinic_Schedule_final.docx) | Clinical rotation schedule |
| [`sources/schedules/2026_Spring_Chinese_Class_Schedule_final.docx`](sources/schedules/2026_Spring_Chinese_Class_Schedule_final.docx) | Chinese-language class schedule |

> **Note:** `build:knowledge` ingests PDFs only. Schedule `.docx` files are stored for staff reference; import section data via admin registration tools or future ingest.

## Related code

- `backend/src/data/mahmCatalog.ts` — structured MAHM course list (align with MAHM catalog PDF)
- `backend/src/services/paymentCalculationPolicy.ts` — payment rules summary
- `backend/src/config/graduationRequirements.ts` — degree credit totals
- `backend/src/lib/catalogRetrieval.ts` — AI catalog search hints

When changing rates or policies, **update the PDF source if it changes**, then align code constants and re-run `npm run build:knowledge`.
