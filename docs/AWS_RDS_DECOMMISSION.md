# AWS RDS decommission (MySQL → Supabase Postgres)

Migration to Supabase Postgres is complete. This runbook covers the final shutdown of the legacy **AWS RDS MySQL** instance.

## Legacy RDS (reference)

| Field | Value |
|-------|-------|
| Instance identifier | `school-db` (verify in AWS Console) |
| Endpoint | `school-db.cd6o8awqe4ig.us-east-2.rds.amazonaws.com` |
| Port | `3306` |
| Database | `school` |
| Region | `us-east-2` |

## Already completed (repo + Cloudflare)

- [x] Production API uses **Hyperdrive → Supabase Postgres** (`myamu-supabase`, id `f9cdb09006c045dd9de2b43f724278fb`)
- [x] Legacy Cloudflare Hyperdrive **`student-portal-mysql`** deleted (pointed at RDS)
- [x] Local `backend/.env` and `backend/.env.example` use Supabase Session pooler only
- [x] Smoke tests pass against Supabase (`npm run smoke:all` in `backend/`)
- [x] Production health: `GET https://myamu-api.wanpanel.ai/api/health/db` → `{"ok":true,"db":true}`

## Pre-delete checklist

Run these before touching RDS:

```bash
# Production DB health
curl -sS https://myamu-api.wanpanel.ai/api/health/db

# Only Supabase Hyperdrive should remain
cd backend && npx wrangler hyperdrive list

# Local smoke (optional)
cd backend && npm run smoke:all
```

Confirm:

1. No application env var still points at `*.rds.amazonaws.com` or port `3306`.
2. Cloudflare Hyperdrive list shows only `myamu-supabase` (PostgreSQL, port 5432).
3. You have a **final RDS snapshot** or verified Supabase backup if you need rollback.

Historical MySQL CSV exports live under `scripts/mysql_exports/` (archive only).

## Delete RDS in AWS Console

1. Sign in to [AWS Console](https://console.aws.amazon.com/) → region **US East (Ohio) `us-east-2`**.
2. Open **RDS** → **Databases**.
3. Select instance **`school-db`** (or search endpoint `school-db.cd6o8awqe4ig`).
4. **Actions** → **Take snapshot** (recommended name: `school-db-final-pre-delete-YYYYMMDD`).
5. Wait until snapshot status is **Available**.
6. **Actions** → **Delete** (or **Modify** → disable deletion protection first if enabled).
7. When prompted:
   - Create a final snapshot: optional if step 4 already done.
   - Retain automated backups: your choice (usually **No** after migration verified).
   - Acknowledge deletion.
8. Wait until instance status is **Deleted** (can take several minutes).

## Optional cleanup (AWS)

After the instance is gone:

- **RDS** → **Snapshots**: delete old manual/automated snapshots when no longer needed (stops storage charges).
- **EC2** → **Security groups**: remove inbound rules that only existed for RDS clients, if unused elsewhere.
- **Secrets Manager / Parameter Store**: rotate or delete MySQL credentials if stored there.

## Optional cleanup (Cloudflare)

No further Hyperdrive action required if only `myamu-supabase` remains. To re-check:

```bash
cd backend && npx wrangler hyperdrive list
```

## Verification after RDS delete

1. Production API still healthy (should be unchanged):

   ```bash
   curl -sS https://myamu-api.wanpanel.ai/api/health/db
   ```

2. Attempting to connect to the old RDS host should **fail** (connection timeout / DNS error).

3. `npm run smoke:all` in `backend/` still passes locally.

## CLI equivalent (if AWS CLI is installed)

Replace `school-db` with the actual DB instance identifier from `aws rds describe-db-instances`.

```bash
# Final snapshot
aws rds create-db-snapshot \
  --db-instance-identifier school-db \
  --db-snapshot-identifier school-db-final-pre-delete-$(date +%Y%m%d) \
  --region us-east-2

# Delete instance (skip final snapshot if snapshot above exists)
aws rds delete-db-instance \
  --db-instance-identifier school-db \
  --skip-final-snapshot \
  --region us-east-2
```

## Security note

Database passwords and Supabase secret keys shared during migration should be **rotated** in Supabase Dashboard when convenient.
