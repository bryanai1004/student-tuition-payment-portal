# Database migrations (Postgres / Supabase)

## Single source of truth

**All new schema changes go in `supabase/migrations/` only.**

Apply to a linked Supabase project:

```bash
supabase link --project-ref <ref>   # once
supabase db push
```

The API reads/writes Postgres via the pooler (`backend/.env`). It does **not** run migrations at startup.

## Production ledger

Applied migrations are recorded in:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

Repository migration **filenames must match** the `version` + `name` in that table. If they diverge, `supabase db push` may try to re-apply already-run DDL.

### Currently applied on production (2026-06-30)

| Version | Name |
|---------|------|
| `20260629154823` | `enable_rls_on_all_public_tables` |
| `20260629161555` | `cleanup_nonstandard_student_names` |
| `20260629181658` | `admin_users_staff_columns` |
| `20260629185159` | `grant_public_schema_api_roles` |
| `20260629191733` | `fk_preflight_cleanup` |
| `20260629191740` | `fk_batch_01_portal_core` |
| `20260629191751` | `fk_batch_02_clinical_billing` |
| `20260629191803` | `fk_batch_03_quiz_requirements` |
| `20260629191805` | `fk_batch_04_evaluations` |
| `20260629191810` | `fk_batch_05_evaluations_deferred` |
| `20260629233852` | `portal_store_orders` |
| `20260629234519` | `fix_portal_id_sequences` |
| `20260630164017` | `student_course_bin` |
| `20260630164451` | `backfill_portal_enrollment_course_section_id_v2` |

### Pending (in repo, not yet on production)

| Version | Name |
|---------|------|
| `20260630180000` | `course_placeholder_equivalencies` |

After review: `supabase db push` from repo root.

Verify repo filenames match the documented ledger:

```bash
npm run db:verify-migrations -w backend
```

## Staging / new environments

**Do not** bootstrap from `scripts/pg_schema.sql` alone — it is a deprecated MySQL-import snapshot.

Recommended:

1. **Clone production** (Supabase branch, backup restore, or schema+data dump), then
2. `supabase db push` for any migrations newer than the clone.

For local portal billing tables only (legacy bootstrap):

```bash
npm run db:bootstrap-portal -w backend
```

Requires `academic_terms` and related legacy tables to already exist.

## Archived legacy SQL

| Path | Status |
|------|--------|
| `archived/mysql-legacy/backend-migrations/` | MySQL-era DDL (20 files). **Do not run on Postgres.** Historical reference only. |
| `backend/sql/` | Pre-migration manual scripts. Prefer `supabase/migrations/`. `db:bootstrap-portal` still uses `portal_accounts_*.sql`. |
| `scripts/pg_schema.sql` | Deprecated snapshot (~2026-06-29 import). Missing RLS, FK batches, `student_course_bin`, `portal_store_orders`, etc. |

## Adding a new migration

```bash
supabase migration new <short_description>
# edit supabase/migrations/<timestamp>_<short_description>.sql
supabase db push
```

Rules:

- Idempotent where possible (`IF NOT EXISTS`, guarded `INSERT`).
- No destructive data migrations on production without registrar sign-off.
- Never re-add files under `archived/mysql-legacy/`.

## FK batch 05 (evaluations)

Migrations `20260629191810` added `NOT VALID` FKs on legacy evaluation rows with historical orphans. To fully enforce:

1. Clean orphan rows (see comments in that migration).
2. `ALTER TABLE … VALIDATE CONSTRAINT …` for each constraint.
