-- JanSetu Database Setup
-- Run this SQL in your MySQL client to create the required tables

CREATE DATABASE IF NOT EXISTS jansetu;
USE jansetu;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schemes table
CREATE TABLE IF NOT EXISTS schemes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    eligibility TEXT,
    link VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample data
INSERT INTO schemes (name, category, description) VALUES
('PM Kisan Samman Nidhi', 'Agriculture', 'Income support of ₹6000 per year in three equal installments to small and marginal farmer families.'),
('Mudra Yojana', 'Finance', 'Provides loans up to ₹10 lakh to non-corporate, non-farm small/micro enterprises.'),
('Ujjwala Yojana', 'Energy', 'Provides free LPG connections to women from Below Poverty Line households.'),
('Ayushman Bharat', 'Healthcare', 'Health insurance scheme providing coverage up to ₹5 lakh per family per year.'),
('Digital India', 'Technology', 'Flagship programme to transform India into a digitally empowered society and knowledge economy.'),
('Swachh Bharat Mission', 'Sanitation', 'Campaign to clean streets, roads, and infrastructure of Indian cities and rural areas.');
