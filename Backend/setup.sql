-- JanSetu Database Setup
-- Run this SQL in your MySQL client to create the required tables

CREATE DATABASE IF NOT EXISTS jansetu;
USE jansetu;

-- Drop existing tables (so you can re-run this cleanly)
DROP TABLE IF EXISTS vote_queue;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS elections;
DROP TABLE IF EXISTS voters;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS schemes;
DROP TABLE IF EXISTS official1;
-- ═══════════════════════════════════════════════════════════
--   USERS (login/register)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(200),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════
--   VOTERS (Voter ID registry — dummy data for demo)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE voters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voter_id VARCHAR(20) NOT NULL UNIQUE,
    mobile_no VARCHAR(15),
    full_name VARCHAR(200) NOT NULL,
    father_name VARCHAR(200),
    age INT NOT NULL,
    gender ENUM('Male', 'Female', 'Other') NOT NULL,
    constituency VARCHAR(200) NOT NULL,
    state VARCHAR(100) NOT NULL,
    address TEXT,
    has_voted BOOLEAN DEFAULT FALSE,
    voted_party VARCHAR(100),
    vote_tx_hash VARCHAR(100),
    voted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════
--   ELECTIONS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE elections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    candidates JSON NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    contract_address VARCHAR(100),
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════
--   VOTE QUEUE (buffer → blockchain)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE vote_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voter_id VARCHAR(20) NOT NULL,
    election_id INT NOT NULL,
    candidate VARCHAR(255) NOT NULL,
    blockchain_hash VARCHAR(100),
    tx_hash VARCHAR(100),
    status ENUM('queued', 'processing', 'done', 'failed') DEFAULT 'queued',
    retry_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id)
);

-- ═══════════════════════════════════════════════════════════
--   COMPLAINTS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    region VARCHAR(200) NOT NULL,
    department VARCHAR(100) NOT NULL,
    level ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    file_path VARCHAR(500),
    status ENUM('pending', 'approve', 'reject') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ═══════════════════════════════════════════════════════════
--   SCHEMES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE schemes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    eligibility TEXT,
    link VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ═══════════════════════════════════════════════════════════
--   SAMPLE DATA
-- ═══════════════════════════════════════════════════════════

-- ─── Active Election ─────────────────────────────────────
INSERT INTO elections (title, description, candidates) VALUES
('Lok Sabha General Election 2026', 'Cast your vote for the parliamentary constituency representative.', '["BJP", "CONGRESS", "SP", "BSP", "AAP", "None_Of_The_Above"]');

-- ─── Dummy Voter IDs ─────────────────────────────────────
INSERT INTO voters (voter_id, mobile_no, full_name, father_name, age, gender, constituency, state, address) VALUES
('VOT-100001', '7251043056', 'Aarav Sharma',     'Rajesh Sharma',     28, 'Male',   'New Delhi',        'Delhi',            '12, Connaught Place, New Delhi'),
('VOT-100002', '9876543211', 'Priya Patel',      'Suresh Patel',      34, 'Female', 'Ahmedabad East',   'Gujarat',          '45, Vastrapur, Ahmedabad'),
('VOT-100003', '9876543212', 'Rohan Singh',      'Manjeet Singh',     22, 'Male',   'Ludhiana',          'Punjab',           '78, Model Town, Ludhiana'),
('VOT-100004', '9876543213', 'Ananya Gupta',     'Vinod Gupta',       41, 'Female', 'Lucknow',           'Uttar Pradesh',    '23, Gomti Nagar, Lucknow'),
('VOT-100005', '9876543214', 'Vikram Yadav',     'Ramesh Yadav',      55, 'Male',   'Patna Sahib',       'Bihar',            '56, Boring Road, Patna'),
('VOT-100006', '9876543215', 'Sneha Reddy',      'Krishna Reddy',     30, 'Female', 'Hyderabad',         'Telangana',        '89, Banjara Hills, Hyderabad'),
('VOT-100007', '9876543216', 'Arjun Nair',       'Sudhir Nair',       26, 'Male',   'Thiruvananthapuram','Kerala',           '12, Kowdiar, Thiruvananthapuram'),
('VOT-100008', '9876543217', 'Kavya Iyer',       'Raghav Iyer',       38, 'Female', 'Chennai South',     'Tamil Nadu',       '34, T. Nagar, Chennai'),
('VOT-100009', '9876543218', 'Manish Tiwari',    'Anil Tiwari',       45, 'Male',   'Bhopal',            'Madhya Pradesh',   '67, Arera Colony, Bhopal'),
('VOT-100010', '9876543219', 'Ritu Joshi',       'Prakash Joshi',     32, 'Female', 'Dehradun',          'Uttarakhand',      '90, Rajpur Road, Dehradun'),
('VOT-100011', '9876543220', 'Saurabh Mishra',   'Devendra Mishra',   29, 'Male',   'Varanasi',          'Uttar Pradesh',    '11, Lanka, Varanasi'),
('VOT-100012', '9876543221', 'Neha Banerjee',    'Arup Banerjee',     36, 'Female', 'Kolkata South',     'West Bengal',      '45, Ballygunge, Kolkata'),
('VOT-100013', '9876543222', 'Aditya Jain',      'Sanjay Jain',       48, 'Male',   'Jaipur',            'Rajasthan',        '78, C-Scheme, Jaipur'),
('VOT-100014', '9876543223', 'Pooja Deshmukh',   'Manoj Deshmukh',    27, 'Female', 'Pune',              'Maharashtra',      '23, Koregaon Park, Pune'),
('VOT-100015', '9876543224', 'Karan Mehta',      'Ashok Mehta',       52, 'Male',   'Mumbai North',      'Maharashtra',      '56, Andheri West, Mumbai'),
('VOT-100016', '9876543225', 'Divya Saxena',     'Rakesh Saxena',     24, 'Female', 'Kanpur',            'Uttar Pradesh',    '89, Swaroop Nagar, Kanpur'),
('VOT-100017', '9876543226', 'Harsh Pandey',     'Om Pandey',         33, 'Male',   'Gorakhpur',         'Uttar Pradesh',    '12, Golghar, Gorakhpur'),
('VOT-100018', '9876543227', 'Meera Kulkarni',   'Sunil Kulkarni',    40, 'Female', 'Nagpur',            'Maharashtra',      '34, Sitabuldi, Nagpur'),
('VOT-100019', '9876543228', 'Rahul Chauhan',    'Vijay Chauhan',     31, 'Male',   'Indore',            'Madhya Pradesh',   '67, Palasia, Indore'),
('VOT-100020', '9876543229', 'Swati Verma',      'Ravi Verma',        37, 'Female', 'Allahabad',         'Uttar Pradesh',    '90, Civil Lines, Prayagraj');

-- ─── Sample Schemes ──────────────────────────────────────
INSERT INTO schemes (name, category, description) VALUES
('PM Kisan Samman Nidhi', 'Agriculture', 'Income support of ₹6000 per year in three equal installments to small and marginal farmer families.'),
('Mudra Yojana', 'Finance', 'Provides loans up to ₹10 lakh to non-corporate, non-farm small/micro enterprises.'),
('Ujjwala Yojana', 'Energy', 'Provides free LPG connections to women from Below Poverty Line households.'),
('Ayushman Bharat', 'Healthcare', 'Health insurance scheme providing coverage up to ₹5 lakh per family per year.'),
('Digital India', 'Technology', 'Flagship programme to transform India into a digitally empowered society and knowledge economy.'),
('Swachh Bharat Mission', 'Sanitation', 'Campaign to clean streets, roads, and infrastructure of Indian cities and rural areas.');


-- ═══════════════════════════════════════════════════════════
--   OFFICIALS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE officials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    department VARCHAR(100) NOT NULL,
    region VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Dummy Official Account ──────────────────────────────
INSERT INTO officials (username, password, full_name, department, region) VALUES
('official1', 'admin123', 'Rajesh Kumar (Public Works)', 'public-works', 'Delhi');

