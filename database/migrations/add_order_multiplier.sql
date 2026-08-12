-- Migration: Add order_multiplier setting
-- Date: 2025-01-06
-- Description: Add setting untuk control jumlah fake orders yang muncul

USE kuota_aggregator;

-- Insert order_multiplier setting dengan default value 1 (normal)
INSERT INTO settings (setting_key, setting_value)
VALUES ('order_multiplier', '1')
ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- Verify
SELECT * FROM settings WHERE setting_key = 'order_multiplier';
