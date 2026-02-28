-- Only apply changes without dropping existing tables
CREATE TABLE IF NOT EXISTS officials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    department VARCHAR(100) NOT NULL,
    region VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO officials (username, password, full_name, department, region) VALUES
('official1', 'admin123', 'Rajesh Kumar (Public Works)', 'public-works', 'Delhi');

-- Update complaints table enum values safely (using VARCHAR temporarily to bypass strict enum checks if needed, then back to ENUM)
ALTER TABLE complaints MODIFY COLUMN status ENUM('pending', 'approve', 'reject', 'submitted', 'in_review', 'resolved', 'dismissed') DEFAULT 'pending';

-- Map old statuses to new statuses for existing rows
UPDATE complaints SET status = 'pending' WHERE status IN ('submitted', 'in_review');
UPDATE complaints SET status = 'approve' WHERE status = 'resolved';
UPDATE complaints SET status = 'reject' WHERE status = 'dismissed';

-- Enforce new strict ENUM
ALTER TABLE complaints MODIFY COLUMN status ENUM('pending', 'approve', 'reject') DEFAULT 'pending';

-- Add mobile_no to voters table
ALTER TABLE voters ADD COLUMN mobile_no VARCHAR(15) AFTER voter_id;
