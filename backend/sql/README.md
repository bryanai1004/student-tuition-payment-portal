# Legacy manual SQL scripts

These files predate the **Supabase migration track**. They were applied ad hoc during portal/clinical feature development.

## Prefer `supabase/migrations/`

New DDL belongs in `supabase/migrations/` only. See [docs/database-migrations.md](../../docs/database-migrations.md).

## Still used by npm scripts

| Script | SQL files |
|--------|-----------|
| `npm run db:bootstrap-portal -w backend` | `portal_accounts_schema.sql`, `portal_accounts_seed.sql` |

All other files here are **historical reference** unless you are manually repairing a very old database.

## Duplicate definitions

Some objects also exist in Supabase migrations (for example `student_course_bin` → `supabase/migrations/20260630164017_student_course_bin.sql`). Do not apply both on the same database.
