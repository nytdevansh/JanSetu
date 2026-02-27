-- JanSetu Database Setup
-- Run this SQL in your MySQL client to create the required tables

CREATE DATABASE IF NOT EXISTS jansetu;
USE jansetu;

-- Drop existing tables (so you can re-run this cleanly)
DROP TABLE IF EXISTS vote_queue;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS polls;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS schemes;

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(200),
    email VARCHAR(255),
    vote_status ENUM('none', 'pending', 'confirmed') DEFAULT 'none',
    vote_tx_hash VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Polls table
CREATE TABLE polls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    candidates JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    contract_address VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vote queue table (buffer between submission and blockchain confirmation)
CREATE TABLE vote_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    poll_id INT NOT NULL,
    candidate VARCHAR(255) NOT NULL,
    status ENUM('queued', 'processing', 'done', 'failed') DEFAULT 'queued',
    blockchain_hash VARCHAR(100),
    tx_hash VARCHAR(100),
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (poll_id) REFERENCES polls(id)
);

-- Complaints table
CREATE TABLE complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    region VARCHAR(200) NOT NULL,
    department VARCHAR(100) NOT NULL,
    level ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    file_path VARCHAR(500),
    status ENUM('submitted', 'in_review', 'resolved', 'dismissed') DEFAULT 'submitted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Schemes table
CREATE TABLE schemes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    eligibility TEXT,
    link VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Sample Data ────────────────────────────────────────

-- Sample polls
INSERT INTO polls (title, description, candidates) VALUES
('Smart City Development Priority', 'Which area should receive priority funding in the Smart City Mission?', '["Public Transport", "Water Supply", "Digital Infrastructure", "Green Spaces & Parks"]'),
('Digital Literacy Programme', 'Should the government expand the Digital Literacy Programme to rural areas?', '["Yes, expand immediately", "Yes, in phased manner", "No, focus on urban first"]'),
('Community Health Initiative', 'Which health initiative should be prioritised in your district?', '["Vaccination Drives", "Mobile Health Clinics", "Health Awareness Camps"]');

-- Sample schemes
INSERT INTO schemes (name, category, description) VALUES
('PM Kisan Samman Nidhi', 'Agriculture', 'Income support of ₹6000 per year in three equal installments to small and marginal farmer families.'),
('Mudra Yojana', 'Finance', 'Provides loans up to ₹10 lakh to non-corporate, non-farm small/micro enterprises.'),
('Ujjwala Yojana', 'Energy', 'Provides free LPG connections to women from Below Poverty Line households.'),
('Ayushman Bharat', 'Healthcare', 'Health insurance scheme providing coverage up to ₹5 lakh per family per year.'),
('Digital India', 'Technology', 'Flagship programme to transform India into a digitally empowered society and knowledge economy.'),
('Swachh Bharat Mission', 'Sanitation', 'Campaign to clean streets, roads, and infrastructure of Indian cities and rural areas.');
