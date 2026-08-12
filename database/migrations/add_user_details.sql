-- Migration: Add address, province, and whatsapp fields to users table
-- Run this SQL on your production database

-- Add new columns
ALTER TABLE users
ADD COLUMN address TEXT AFTER bank_account_number,
ADD COLUMN province VARCHAR(100) AFTER address,
ADD COLUMN whatsapp VARCHAR(20) AFTER province;

-- Add unique index on bank_account_number to prevent duplicate accounts
ALTER TABLE users
ADD UNIQUE INDEX idx_bank_account_unique (bank_account_number);

-- Add index on whatsapp for faster lookups
ALTER TABLE users
ADD INDEX idx_whatsapp (whatsapp);
