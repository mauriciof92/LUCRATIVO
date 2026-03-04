-- Migration: Add unique constraint on match + hour for bet_results
-- Date: 2026-03-03
-- Purpose: Avoid duplicate games with same match and hour

-- First, remove any existing duplicates before adding the constraint
DELETE FROM bet_results 
WHERE id NOT IN (
  SELECT DISTINCT ON (match, hour) id 
  FROM bet_results 
  ORDER BY match, hour, created_at DESC
);

-- Add unique constraint
ALTER TABLE bet_results 
ADD CONSTRAINT bet_results_match_hour_unique 
UNIQUE (match, hour);

-- Create index for better performance on the unique constraint
CREATE INDEX IF NOT EXISTS idx_bet_results_match_hour 
ON bet_results (match, hour);
