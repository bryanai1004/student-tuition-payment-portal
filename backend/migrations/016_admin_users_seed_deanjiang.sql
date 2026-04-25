-- Single DB-backed admin seed: deanjiang@amu (password: deanjiang123, bcrypt cost 10).
-- Legacy admin emails remain out of this table; see `legacyAdminAccounts.ts`.
INSERT INTO admin_users (email, password_hash, role)
VALUES (
  'deanjiang@amu',
  '$2b$10$awuutcanoMmozW2ZukdjJ..haZQmw2c7U7qBci3jLYi46ZU5vMAEG',
  'super_admin'
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  role = VALUES(role);
