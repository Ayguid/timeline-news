-- News Timeline — migration 0007
-- Admin role for curating GLOBAL sources.
-- Only users with role='admin' may add/edit/remove global sources; everyone
-- else can only toggle which global sources they want + add their own PERSONAL
-- sources (capped in app code).

BEGIN;

-- users.role kept for schema completeness, but ADMIN is enforced at runtime by
-- the ADMIN_EMAILS env var (src/lib/session.ts). We do NOT bake any user as
-- admin here — no silent admin by default.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

COMMIT;