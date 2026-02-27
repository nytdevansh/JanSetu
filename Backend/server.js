const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
// CORS — allow requests from any origin during development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

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

// Helper: promisify db.query for cleaner async/await usage
function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}


// ═══════════════════════════════════════════════════════════
//   AUTH ROUTES
// ═══════════════════════════════════════════════════════════

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
    const { username, password, name, email } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const query = 'INSERT INTO users (username, password, name, email) VALUES (?, ?, ?, ?)';
    db.query(query, [username, password, name || username, email || null], (err, result) => {
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


// ═══════════════════════════════════════════════════════════
//   POLLS & VOTING ROUTES
// ═══════════════════════════════════════════════════════════

// Get all active polls
app.get('/api/polls', async (req, res) => {
    try {
        const polls = await dbQuery('SELECT * FROM polls WHERE is_active = TRUE ORDER BY created_at DESC');
        // Parse the JSON candidates field
        const parsed = polls.map(p => ({
            ...p,
            candidates: typeof p.candidates === 'string' ? JSON.parse(p.candidates) : p.candidates
        }));
        res.json({ polls: parsed });
    } catch (err) {
        console.error('Polls query error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Submit a vote
app.post('/api/vote', async (req, res) => {
    const { userId, pollId, candidate } = req.body;

    if (!userId || !pollId || !candidate) {
        return res.status(400).json({ error: 'userId, pollId, and candidate are required' });
    }

    try {
        // 1. Check user exists
        const users = await dbQuery('SELECT id, vote_status FROM users WHERE id = ?', [userId]);
        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 2. Check if user already voted on this poll
        const existingVote = await dbQuery(
            'SELECT id FROM vote_queue WHERE user_id = ? AND poll_id = ? AND status != ?',
            [userId, pollId, 'failed']
        );
        if (existingVote && existingVote.length > 0) {
            return res.status(409).json({ error: 'You have already voted on this poll' });
        }

        // 3. Check poll exists and is active
        const polls = await dbQuery('SELECT * FROM polls WHERE id = ? AND is_active = TRUE', [pollId]);
        if (!polls || polls.length === 0) {
            return res.status(404).json({ error: 'Poll not found or inactive' });
        }

        // 4. Validate candidate
        const poll = polls[0];
        const candidates = typeof poll.candidates === 'string' ? JSON.parse(poll.candidates) : poll.candidates;
        if (!candidates.includes(candidate)) {
            return res.status(400).json({ error: 'Invalid candidate for this poll' });
        }

        // 5. Insert into vote queue + update user status (atomic)
        await dbQuery(
            'INSERT INTO vote_queue (user_id, poll_id, candidate, status) VALUES (?, ?, ?, ?)',
            [userId, pollId, candidate, 'queued']
        );
        await dbQuery(
            'UPDATE users SET vote_status = ? WHERE id = ?',
            ['pending', userId]
        );

        res.json({
            success: true,
            message: 'Vote submitted successfully! It will be confirmed on the blockchain shortly.',
            status: 'pending'
        });

    } catch (err) {
        console.error('Vote submission error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get vote status for a user
app.get('/api/vote/status', async (req, res) => {
    const { userId, pollId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        let query = 'SELECT vq.*, p.title as poll_title FROM vote_queue vq JOIN polls p ON vq.poll_id = p.id WHERE vq.user_id = ?';
        const params = [userId];

        if (pollId) {
            query += ' AND vq.poll_id = ?';
            params.push(pollId);
        }

        query += ' ORDER BY vq.created_at DESC';

        const votes = await dbQuery(query, params);
        const user = await dbQuery('SELECT vote_status, vote_tx_hash FROM users WHERE id = ?', [userId]);

        res.json({
            userStatus: user[0]?.vote_status || 'none',
            txHash: user[0]?.vote_tx_hash || null,
            votes: votes || []
        });
    } catch (err) {
        console.error('Vote status error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get vote results for a poll (aggregated counts)
app.get('/api/polls/:pollId/results', async (req, res) => {
    const { pollId } = req.params;

    try {
        const poll = await dbQuery('SELECT * FROM polls WHERE id = ?', [pollId]);
        if (!poll || poll.length === 0) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        const results = await dbQuery(
            "SELECT candidate, COUNT(*) as votes FROM vote_queue WHERE poll_id = ? AND status IN ('queued', 'processing', 'done') GROUP BY candidate",
            [pollId]
        );

        const candidates = typeof poll[0].candidates === 'string' ? JSON.parse(poll[0].candidates) : poll[0].candidates;

        // Build results map with 0 for candidates with no votes
        const resultsMap = {};
        candidates.forEach(c => { resultsMap[c] = 0; });
        results.forEach(r => { resultsMap[r.candidate] = r.votes; });

        res.json({
            poll: {
                id: poll[0].id,
                title: poll[0].title,
                description: poll[0].description
            },
            results: resultsMap,
            totalVotes: results.reduce((sum, r) => sum + r.votes, 0)
        });
    } catch (err) {
        console.error('Poll results error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ═══════════════════════════════════════════════════════════
//   COMPLAINTS ROUTES
// ═══════════════════════════════════════════════════════════

// Submit a complaint
app.post('/api/complaint', async (req, res) => {
    const { userId, region, department, level, title, description } = req.body;

    if (!userId || !region || !department || !level || !title || !description) {
        return res.status(400).json({ error: 'All fields are required (userId, region, department, level, title, description)' });
    }

    const validLevels = ['low', 'medium', 'high', 'critical'];
    if (!validLevels.includes(level)) {
        return res.status(400).json({ error: 'Invalid level. Must be: low, medium, high, or critical' });
    }

    try {
        const result = await dbQuery(
            'INSERT INTO complaints (user_id, region, department, level, title, description) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, region, department, level, title, description]
        );

        res.status(201).json({
            success: true,
            message: 'Complaint submitted successfully',
            complaintId: result.insertId,
            trackingId: 'JAN-' + String(result.insertId).padStart(6, '0')
        });
    } catch (err) {
        console.error('Complaint submission error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get complaints for a user
app.get('/api/complaints', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        const complaints = await dbQuery(
            'SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );

        res.json({ complaints: complaints || [] });
    } catch (err) {
        console.error('Complaints query error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ═══════════════════════════════════════════════════════════
//   SEARCH & SCHEMES ROUTES
// ═══════════════════════════════════════════════════════════

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


// ─── Catch-all: serve frontend (using middleware to avoid Express 5 405 issue) ─
app.use((req, res, next) => {
    // Don't intercept API routes
    if (req.path.startsWith('/api/')) {
        return next();
    }
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
