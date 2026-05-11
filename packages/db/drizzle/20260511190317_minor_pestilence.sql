-- No-op: switch integer flag columns to Drizzle's boolean mode (TS-only change,
-- on-disk values stay 0/1). Drizzle wants to recreate 5 tables to refresh
-- the schema string; we keep the journal entry but skip the SQL.
SELECT 1;
