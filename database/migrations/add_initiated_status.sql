-- Migration: Add 'initiated' status to deposits table
-- Purpose: Support 2-step deposit flow (initiate → upload proof)
-- Date: 2025-01-13

USE kuota_aggregator;

-- Add 'initiated' status to ENUM
ALTER TABLE deposits
MODIFY COLUMN status ENUM('initiated', 'pending', 'approved', 'rejected') DEFAULT 'initiated';

-- Update existing records (optional - if there are existing 'pending' without proof)
-- UPDATE deposits SET status = 'initiated' WHERE proof_image IS NULL AND status = 'pending';
