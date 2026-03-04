-- Migration: Check and fix bet_results constraints
-- Date: 2026-03-03
-- Purpose: Verify existing constraints and ensure proper setup

-- Check current constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'bet_results'::regclass;

-- Check current indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'bet_results';

-- If constraint already exists, we don't need to add it again
-- The important part is that our upsert logic uses deterministic IDs

-- Optional: Clean up any remaining duplicates (safe to run multiple times)
DELETE FROM bet_results 
WHERE id NOT IN (
  SELECT DISTINCT ON (match, hour) id 
  FROM bet_results 
  ORDER BY match, hour, created_at DESC
);

-- Confirm table structure
\d bet_results;
