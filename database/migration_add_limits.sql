-- Migration: Add conversion and fill order limits
USE kuota_aggregator;

-- Add last_conversion_date to track daily conversion limit (only if not exists)
SET @s = (SELECT IF(
    (SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'users'
        AND table_schema = 'kuota_aggregator'
        AND column_name = 'last_conversion_date'
    ) > 0,
    "SELECT 'Column last_conversion_date already exists'",
    "ALTER TABLE users ADD COLUMN last_conversion_date DATE AFTER quota_gb"
));

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add last_fill_at to track fill order cooldown (only if not exists)
SET @s = (SELECT IF(
    (SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'users'
        AND table_schema = 'kuota_aggregator'
        AND column_name = 'last_fill_at'
    ) > 0,
    "SELECT 'Column last_fill_at already exists'",
    "ALTER TABLE users ADD COLUMN last_fill_at BIGINT AFTER quota_gb"
));

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for better performance (ignore errors if already exists)
-- Note: Indexes will be created only if they don't exist
