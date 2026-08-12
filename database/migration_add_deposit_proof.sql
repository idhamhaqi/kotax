-- Migration: Add deposit proof image and settings table
USE kuota_aggregator;

-- Add proof_image column to deposits table (only if not exists)
SET @s = (SELECT IF(
    (SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'deposits'
        AND table_schema = 'kuota_aggregator'
        AND column_name = 'proof_image'
    ) > 0,
    "SELECT 'Column proof_image already exists'",
    "ALTER TABLE deposits ADD COLUMN proof_image VARCHAR(255) AFTER unique_amount"
));

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings
INSERT INTO settings (setting_key, setting_value) VALUES
('deposit_bank_name', NULL),
('deposit_bank_account', NULL),
('deposit_account_holder', NULL),
('admin_contact', NULL)
ON DUPLICATE KEY UPDATE setting_key=setting_key;
