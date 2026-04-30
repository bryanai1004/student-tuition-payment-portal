# AMU / MAHM & DAHM catalog vs `school.courses` database

## Source documents

- **MAHM:** Master of Acupuncture and Herbal Medicine — *Catalog and Student Handbook* (2025–2026, effective Oct 1, 2025–Dec 31, 2026).
- **DAHM:** Doctor of Acupuncture and Herbal Medicine — *Catalog and Student Handbook* (2025–2026).

Store official PDFs in a controlled location (registrar / shared drive). Paths on a developer PC will differ.

## Important: two course-numbering systems in the database

The **2025–26 PDFs** describe curriculum using **current catalog numbers**, for example:

- Basic sciences: **BS110**, BS120, BS130, … (not only BS101…)
- Western medicine diagnostics: **WM100**, **WM310**, WM320, WM330, then **WM401–WM404**, **WM510**
- TCM foundation: **OM100**, **OM111**, **OM112**, then **OM201–OM203**
- Herbology: **HB110**, **HB121–HB124**, **HB201–HB204**, …
- Acupuncture: **AC100**, **AC111–AC112**, **AC201–202**, **AC321–322**, …
- Case management / PD: **CM301–303**, **MG410**, **MG420**, **PH101**, **RM400**, **CR501–502**, …

The **`school.courses`** table still contains **older parallel codes** (e.g. **BS101–BS107**, **WM301–WM304**, **OM101–OM102**, **HB100**, **TB101–TB102**) **alongside** the newer rows (**BS110**, **WM310**, **OM111**, **HB110**, **TB110**, etc.).

So the database is already a **superset** of catalog numbering in many areas. **Do not** blindly rename or delete codes without checking:

- `portal_enrollments`, `portal_courses`, `marks`, `course_sections`, etc.

## What can be updated safely from the PDFs

| Change type | Risk | Guidance |
|-------------|------|----------|
| **`category`** to a valid `course_category.category_id` | Low if registrar-approved | Done in a separate data pass; use lookup table for letters. |
| **`eng_name` / title** when **`code` matches the PDF exactly** | Low | Example: WM401–WM404 titles aligned to “Western Clinical Sciences I–IV” per MAHM catalog. |
| **`units` (credits)** | **Medium–high** | Only where registrar confirms the **same** course code should match the PDF (e.g. legacy **WM500** at 2 units vs **WM510** at 3 units in the PDF may be **two different offerings**, not a typo). |
| **Renaming `code`** | **High** | Treat as a migration: new row + crosswalk + update enrollments, or official one-time SQL from registrar. |

## Known pairs to review (registrar)

| PDF (2025–26) | DB / notes |
|---------------|------------|
| **BS130** Physics — **3** units | **BS103** Physics — **2** units (legacy); **BS130** also exists at 3. Clarify which students use which. |
| **WM510** Survey of Clinical Medicine — **3** units | **WM510** in DB = 3; **WM500** = 2 — clarify if WM500 is retired or should be bumped to 3. |
| **HB110** Intro to Botany — **3** units | **HB100** = 2 units; **HB110** = 3 — parallel tracks? |
| **TB110** Tai Ji & Qi Gong — **3** units | **TB101** / **TB102** split at 2 each; **TB110** combined exists. |

## DAHM-specific rows

The DAHM PDF adds completion curriculum (e.g. **IM610–IM660**, **ICM720**, **EBM750**, **ICS700**, **PRO800**) and restates MAHM-aligned blocks. New doctoral-only codes should be **inserted** (or imported) only after confirming they are not already represented under another code.

## SQL utilities in this repo

From `backend/`:

```bash
npm run db:query -- "SELECT …"
```

Loads `backend/.env` and runs a **single** SQL statement (no `mysql` client required).

## Change log (manual)

| Date | Change |
|------|--------|
| (session) | `WM401`–`WM404` `eng_name` updated to “Western Clinical Sciences I–IV” to match MAHM 2025–26 wording. |
| (session) | Prior pass: `courses.category` filled for blank rows using `course_category` IDs (prefix rules + specials). |

---

*Maintainers: append registrar-approved unit/credit updates and any official code migration scripts below.*
