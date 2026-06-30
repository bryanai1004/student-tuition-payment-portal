-- admin_users staff columns + roster seed (Supabase Auth holds passwords).
-- Applied on production as migration 20260629181658.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS username varchar(64);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS display_name varchar(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_username ON admin_users (username);

DELETE FROM admin_users;

INSERT INTO admin_users (email, username, display_name, password_hash, role) VALUES
  ('drwu@alhambrahospital.com', 'drwu', 'dr.Wu', 'supabase-auth', 'admin'),
  ('consult@amu.edu', 'drjiang', 'dr. Jiang', 'supabase-auth', 'admin'),
  ('cao@amu.edu', 'lilian', 'Lilian', 'supabase-auth', 'admin'),
  ('start@amu.edu', 'msma', 'Ms. Ma', 'supabase-auth', 'admin'),
  ('registrar@amu.edu', 'xiaoting', 'Xiaoting', 'supabase-auth', 'admin'),
  ('office@amu.edu', 'qiuyang', 'Qiuyang', 'supabase-auth', 'admin'),
  ('director@amu.edu', 'megan', 'Megan', 'supabase-auth', 'super_admin'),
  ('clinicdean@amu.edu', 'kchu', 'Dr.Chu', 'supabase-auth', 'clinical_admin'),
  ('clinic@amu.edu', 'wenjing', 'Wenjing', 'supabase-auth', 'clinical_admin'),
  ('ariel@amu.edu', 'ariel', 'Ariel', 'supabase-auth', 'admin'),
  ('wanpanelami@gmail.com', 'ari', 'Ari', 'supabase-auth', 'admin'),
  ('bingchen.li@wanpanel.ai', 'bingchen', 'Bingchen', 'supabase-auth', 'admin'),
  ('mona.weng@wanpanel.ai', 'mona', 'Mona', 'supabase-auth', 'admin');
