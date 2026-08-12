-- Migration: Add order_profit_multiplier setting
-- Date: 2025-11-08
-- Description: Add setting to control the profit multiplier for fill orders

USE kuota_aggregator;

-- Insert order_profit_multiplier setting with a default value of 1 (normal)
INSERT INTO settings (setting_key, setting_value)
VALUES ('order_profit_multiplier', '1')
ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- Verify
SELECT * FROM settings WHERE setting_key = 'order_profit_multiplier';
