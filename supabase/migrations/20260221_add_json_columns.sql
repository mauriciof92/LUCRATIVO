-- Migration: Add JSON data columns to bet_results
-- Date: 2026-02-21
-- Purpose: Store favorito, combo, and poison data as JSON for complete hydration

ALTER TABLE bet_results ADD COLUMN IF NOT EXISTS favorito_data TEXT;
ALTER TABLE bet_results ADD COLUMN IF NOT EXISTS combo_data TEXT;
ALTER TABLE bet_results ADD COLUMN IF NOT EXISTS poison_data TEXT;

-- Index for faster queries on games with poison triggers
CREATE INDEX IF NOT EXISTS idx_bet_results_poison ON bet_results ((poison_data IS NOT NULL));
