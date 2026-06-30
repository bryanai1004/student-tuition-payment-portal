# MySQL-era legacy migrations (archived)

These 20 SQL files lived under `backend/migrations/` during the **AWS RDS MySQL** period.

They are **not** executed by the application or Supabase CLI. After cutover to **Supabase Postgres**, their DDL was applied manually or absorbed into the initial Postgres import.

## Do not run on Postgres

Most scripts use MySQL syntax (`SET @db`, `AUTO_INCREMENT`, `TINYINT`, `PREPARE`, `ENUM MODIFY`). Running them against Supabase will fail or behave incorrectly.

## Where schema lives now

- **Active:** `supabase/migrations/` — see [docs/database-migrations.md](../../docs/database-migrations.md)
- **Reference snapshot:** `scripts/pg_schema.sql` (deprecated, incomplete)

## File index

| File | Purpose |
|------|---------|
| `001_academic_terms_payment_policy.sql` | `payment_due_date`, `lock_registration_if_overdue` |
| `002_portal_billing_adjustments_adjustment_source.sql` | `adjustment_source` column |
| `003_academic_terms_withdraw_deadline.sql` | `withdraw_deadline` |
| `003_portal_document_requirements.sql` | Document compliance tables |
| `004_legacy_students_program.sql` | `students.program` MAHM/DAHM |
| `005_academic_terms_is_posted_to_dashboard.sql` | Dashboard posting flag |
| `006_academic_terms_clinic_appointment_deadline.sql` | Clinic scheduling deadline |
| `007_portal_billing_adjustment_source_clinical.sql` | `system_clinical` source |
| `008_clinical_booking_payment_holds.sql` | Payment hold table |
| `009_clinical_booking_payment_deadline_3h.sql` | Hold expiry data fix |
| `009_students_photo_path.sql` | `students.photo_path` |
| `010_portal_system_late_fee_uniqueness.sql` | Late fee uniqueness |
| `011_portal_system_late_fee_reconciliation.sql` | Reversal linkage |
| `012_clinical_roster_slot_indexes.sql` | Clinical roster indexes |
| `013_admin_finance_balance_indexes.sql` | Finance balance indexes |
| `014_portal_billing_category_exam.sql` | `exam` billing category |
| `015_admin_users.sql` | MySQL `admin_users` create (superseded) |
| `016_admin_users_seed_deanjiang.sql` | Legacy seed (superseded) |
| `017_students_amu_email.sql` | `students.amu_email` |
| `018_portal_store_orders.sql` | Fee store (superseded by `supabase/migrations/20260629233852_…`) |
