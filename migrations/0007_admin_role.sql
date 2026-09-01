-- News Timeline — migration 0007
-- Admin role for curating GLOBAL sources.
-- Only users with role='admin' may add/edit/remove global sources; everyone
-- else can only toggle which global sources they want + add their own PERSONAL
-- sources (capped in app code).

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Make the seeded demo user an admin (curated starter feeds live globally).
UPDATE users SET role = 'admin' WHERE id = 'user_demo';

COMMIT;