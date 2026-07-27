-- Runs on first init of the postgres volume only (empty data dir).
-- Creates the `umami` database that the umami service's DATABASE_URL points at.
-- POSTGRES_DB only auto-creates the platform's `umkmcepat` db; umami needs its own.
SELECT 'CREATE DATABASE umami'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec
