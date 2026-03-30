-- Run once if older accounts fail login after email normalization (trim/lowercase).
-- psql DATABASE_URL -f scripts/normalize-emails.sql

UPDATE users SET email = lower(trim(email));
