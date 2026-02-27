const express = require('express');
const path = require('path');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the Frontend as static files
app.use(express.static(path.join(__dirname, '..', 'Frontend')));

// ─── MySQL Connection (configure your credentials) ───────
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'jansetu'
});

db.connect((err) => {
    if (err) {
        console.error('⚠️  MySQL connection failed:', err.message);
        console.log('   Server will continue without database.');
    } else {
        console.log('✅ Connected to MySQL database');
    }
});

// ─── API Routes ──────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'JanSetu Backend',
        timestamp: new Date().toISOString()
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check credentials against database
    const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error('Login query error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results && results.length > 0) {
            res.json({
                success: true,
                message: 'Login successful',
                user: {
                    id: results[0].id,
                    username: results[0].username,
                    name: results[0].name || results[0].username
                }
            });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

// Register
app.post('/api/register', (req, res) => {
    const { username, password, name } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const query = 'INSERT INTO users (username, password, name) VALUES (?, ?, ?)';
    db.query(query, [username, password, name || username], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Username already exists' });
            }
            console.error('Register query error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            userId: result.insertId
        });
    });
});

// Search schemes/services
app.get('/api/search', (req, res) => {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    const query = 'SELECT * FROM schemes WHERE name LIKE ? OR description LIKE ? LIMIT 20';
    const searchTerm = `%${q}%`;
    db.query(query, [searchTerm, searchTerm], (err, results) => {
        if (err) {
            console.error('Search query error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({ results: results || [], count: results ? results.length : 0 });
    });
});

// Get all schemes
app.get('/api/schemes', (req, res) => {
    const query = 'SELECT * FROM schemes ORDER BY created_at DESC';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Schemes query error:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({ schemes: results || [] });
    });
});

// ─── Catch-all: serve frontend ────────────────────────────
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'Frontend', 'index.html'));
});

// ─── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════╗
    ║        🇮🇳  JanSetu Server  🇮🇳        ║
    ╠══════════════════════════════════════╣
    ║  Running on: http://localhost:${PORT}   ║
    ║  Frontend:   Served from /Frontend   ║
    ║  API Base:   /api                    ║
    ╚══════════════════════════════════════╝
    `);
});
