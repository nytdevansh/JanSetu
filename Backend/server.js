const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Vote hashing salt
const VOTE_SALT = process.env.VOTE_SALT || 'jansetu_vote_salt_2026';

// ─── Middleware ───────────────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'Frontend')));

// ─── MySQL Connection ────────────────────────────────────
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

function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

function hashVoterId(voterId) {
    return '0x' + crypto.createHash('sha256').update(voterId + VOTE_SALT).digest('hex');
}


// ═══════════════════════════════════════════════════════════
//   AUTH ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'JanSetu Backend', timestamp: new Date().toISOString() });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        if (results && results.length > 0) {
            res.json({
                success: true, message: 'Login successful',
                user: { id: results[0].id, username: results[0].username, name: results[0].name || results[0].username }
            });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { username, password, name, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    db.query('INSERT INTO users (username, password, name, email) VALUES (?, ?, ?, ?)',
        [username, password, name || username, email || null], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already exists' });
                return res.status(500).json({ error: 'Internal server error' });
            }
            res.status(201).json({ success: true, message: 'Registration successful', userId: result.insertId });
        });
});


// ═══════════════════════════════════════════════════════════
//   ELECTION & VOTING ROUTES
// ═══════════════════════════════════════════════════════════

// Get active elections
app.get('/api/elections', async (req, res) => {
    try {
        const elections = await dbQuery('SELECT * FROM elections WHERE is_active = TRUE ORDER BY created_at DESC');
        const parsed = elections.map(e => ({
            ...e,
            candidates: typeof e.candidates === 'string' ? JSON.parse(e.candidates) : e.candidates
        }));
        res.json({ elections: parsed });
    } catch (err) {
        console.error('Elections query error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify a Voter ID (check if valid + if already voted)
app.post('/api/voter/verify', async (req, res) => {
    const { voterId } = req.body;
    if (!voterId) return res.status(400).json({ error: 'Voter ID is required' });

    try {
        const voters = await dbQuery('SELECT * FROM voters WHERE voter_id = ?', [voterId]);

        if (!voters || voters.length === 0) {
            return res.status(404).json({ error: 'Invalid Voter ID. Not found in the registry.', valid: false });
        }

        const voter = voters[0];

        if (voter.has_voted) {
            return res.status(409).json({
                error: 'This Voter ID has already been used to cast a vote.',
                valid: true,
                alreadyVoted: true,
                votedAt: voter.voted_at
            });
        }

        // Valid and hasn't voted
        res.json({
            valid: true,
            alreadyVoted: false,
            voter: {
                name: voter.full_name,
                fatherName: voter.father_name,
                age: voter.age,
                gender: voter.gender,
                constituency: voter.constituency,
                state: voter.state
            }
        });

    } catch (err) {
        console.error('Voter verify error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Cast a vote
app.post('/api/vote', async (req, res) => {
    const { voterId, electionId, candidate } = req.body;

    if (!voterId || !electionId || !candidate) {
        return res.status(400).json({ error: 'voterId, electionId, and candidate are required' });
    }

    try {
        // 1. Verify voter exists
        const voters = await dbQuery('SELECT * FROM voters WHERE voter_id = ?', [voterId]);
        if (!voters || voters.length === 0) {
            return res.status(404).json({ error: 'Invalid Voter ID' });
        }

        // 2. Check if already voted
        const voter = voters[0];
        if (voter.has_voted) {
            return res.status(409).json({ error: 'This Voter ID has already cast a vote' });
        }

        // 3. Verify election exists and is active
        const elections = await dbQuery('SELECT * FROM elections WHERE id = ? AND is_active = TRUE', [electionId]);
        if (!elections || elections.length === 0) {
            return res.status(404).json({ error: 'Election not found or inactive' });
        }

        // 4. Validate candidate
        const election = elections[0];
        const candidates = typeof election.candidates === 'string' ? JSON.parse(election.candidates) : election.candidates;
        if (!candidates.includes(candidate)) {
            return res.status(400).json({ error: 'Invalid candidate for this election' });
        }

        // 5. Hash the voter ID for blockchain privacy
        const hashedVoterId = hashVoterId(voterId);

        // 6. Insert into vote queue
        await dbQuery(
            'INSERT INTO vote_queue (voter_id, election_id, candidate, blockchain_hash, status) VALUES (?, ?, ?, ?, ?)',
            [voterId, electionId, candidate, hashedVoterId, 'queued']
        );

        // 7. Mark voter as voted
        await dbQuery(
            'UPDATE voters SET has_voted = TRUE, voted_party = ?, voted_at = NOW() WHERE voter_id = ?',
            [candidate, voterId]
        );

        res.json({
            success: true,
            message: 'Vote cast successfully! Your vote is being processed on the blockchain.',
            blockchainHash: hashedVoterId,
            candidate: candidate,
            status: 'queued'
        });

    } catch (err) {
        console.error('Vote submission error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get election results (public — open data)
app.get('/api/elections/:electionId/results', async (req, res) => {
    const { electionId } = req.params;

    try {
        const election = await dbQuery('SELECT * FROM elections WHERE id = ?', [electionId]);
        if (!election || election.length === 0) {
            return res.status(404).json({ error: 'Election not found' });
        }

        const results = await dbQuery(
            "SELECT candidate, COUNT(*) as votes FROM vote_queue WHERE election_id = ? AND status IN ('queued', 'processing', 'done') GROUP BY candidate",
            [electionId]
        );

        const candidates = typeof election[0].candidates === 'string' ? JSON.parse(election[0].candidates) : election[0].candidates;
        const resultsMap = {};
        candidates.forEach(c => { resultsMap[c] = 0; });
        results.forEach(r => { resultsMap[r.candidate] = r.votes; });

        const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);

        res.json({
            election: { id: election[0].id, title: election[0].title, description: election[0].description },
            results: resultsMap,
            totalVotes: totalVotes
        });
    } catch (err) {
        console.error('Election results error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get vote receipt/status by voter ID (for transparency)
app.get('/api/vote/receipt', async (req, res) => {
    const { voterId } = req.query;
    if (!voterId) return res.status(400).json({ error: 'voterId is required' });

    try {
        const voter = await dbQuery('SELECT * FROM voters WHERE voter_id = ?', [voterId]);
        if (!voter || voter.length === 0) {
            return res.status(404).json({ error: 'Voter ID not found' });
        }

        if (!voter[0].has_voted) {
            return res.json({ hasVoted: false });
        }

        const voteRecord = await dbQuery(
            'SELECT candidate, blockchain_hash, tx_hash, status, created_at FROM vote_queue WHERE voter_id = ? ORDER BY created_at DESC LIMIT 1',
            [voterId]
        );

        res.json({
            hasVoted: true,
            votedAt: voter[0].voted_at,
            vote: voteRecord[0] || null,
            blockchainHash: voteRecord[0]?.blockchain_hash || null,
            txHash: voteRecord[0]?.tx_hash || null,
            status: voteRecord[0]?.status || 'unknown'
        });
    } catch (err) {
        console.error('Vote receipt error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ═══════════════════════════════════════════════════════════
//   OFFICIAL ROUTES
// ═══════════════════════════════════════════════════════════

// Official Login
app.post('/api/official/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        const officials = await dbQuery('SELECT id, username, full_name, department, region FROM officials WHERE username = ? AND password = ?', [username, password]);
        if (!officials || officials.length === 0) {
            return res.status(401).json({ error: 'Invalid official credentials' });
        }
        res.json({ success: true, official: officials[0] });
    } catch (err) {
        console.error('Official login error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get complaints for an official (filtered by their department and region)
app.get('/api/official/complaints', async (req, res) => {
    const { department, region } = req.query;
    if (!department || !region) return res.status(400).json({ error: 'Department and region required' });

    try {
        const complaints = await dbQuery(
            'SELECT c.*, u.name as citizen_name FROM complaints c JOIN users u ON c.user_id = u.id WHERE c.department = ? AND c.region = ? ORDER BY c.created_at DESC',
            [department, region]
        );
        res.json({ complaints: complaints || [] });
    } catch (err) {
        console.error('Fetch official complaints error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update complaint status
app.put('/api/official/complaint/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'approve', 'reject'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be pending, approve, or reject.' });
    }

    try {
        await dbQuery('UPDATE complaints SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true, message: `Complaint status updated to ${status}` });
    } catch (err) {
        console.error('Update complaint status error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ═══════════════════════════════════════════════════════════
//   COMPLAINTS ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/complaint', async (req, res) => {
    const { userId, region, department, level, title, description } = req.body;
    if (!userId || !region || !department || !level || !title || !description) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const validLevels = ['low', 'medium', 'high', 'critical'];
    if (!validLevels.includes(level)) return res.status(400).json({ error: 'Invalid level' });

    try {
        const result = await dbQuery(
            'INSERT INTO complaints (user_id, region, department, level, title, description) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, region, department, level, title, description]
        );
        res.status(201).json({
            success: true, message: 'Complaint submitted successfully',
            complaintId: result.insertId,
            trackingId: 'JAN-' + String(result.insertId).padStart(6, '0')
        });
    } catch (err) {
        console.error('Complaint error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/complaints', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    try {
        const complaints = await dbQuery('SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.json({ complaints: complaints || [] });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});


// ═══════════════════════════════════════════════════════════
//   SEARCH & SCHEMES
// ═══════════════════════════════════════════════════════════

app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query is required' });

    db.query('SELECT * FROM schemes WHERE name LIKE ? OR description LIKE ? LIMIT 20',
        [`%${q}%`, `%${q}%`], (err, results) => {
            if (err) return res.status(500).json({ error: 'Internal server error' });
            res.json({ results: results || [], count: results ? results.length : 0 });
        });
});

app.get('/api/schemes', (req, res) => {
    db.query('SELECT * FROM schemes ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Internal server error' });
        res.json({ schemes: results || [] });
    });
});


// ─── Catch-all ───────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, '..', 'Frontend', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────
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
