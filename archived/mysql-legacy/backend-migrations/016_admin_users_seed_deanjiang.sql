-- Single DB-backed admin seed: deanjiang@amu (password: deanjiang123, bcrypt cost 10).
-- Legacy hardcoded admin accounts were removed; staff roster is seeded via migrateStaffToSupabaseAuth.
INSERT INTO admin_users (email, password_hash, role)
VALUES (
  'deanjiang@amu',
  '$2b$10$awuutcanoMmozW2ZukdjJ..haZQmw2c7U7qBci3jLYi46ZU5vMAEG',
  'super_admin'
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  role = VALUES(role);
