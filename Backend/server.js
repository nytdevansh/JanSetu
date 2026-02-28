require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const crypto = require('crypto');
const axios = require('axios');

// ─── Environment Variable Validation ─────────────────────────
console.log('\n🔍 --- Environment Variables Check ---');
const expectedEnvVars = [
    { name: 'DB_HOST', default: 'localhost' },
    { name: 'DB_USER', default: 'root' },
    { name: 'DB_PASS', default: '(empty)' },
    { name: 'DB_NAME', default: 'jansetu' },
    { name: 'PORT', default: '3000' },
    { name: 'VOTE_SALT', required: true, warn: 'CRITICAL: Set VOTE_SALT in .env to securely encrypt votes.' },
    { name: 'TWOFACTOR_API_KEY', warn: 'SMS OTPs will fallback to console simulator.' },
    { name: 'POLYGON_RPC_URL', warn: 'Blockchain reading may fail.' },
    { name: 'RELAYER_PRIVATE_KEY', warn: 'Blockchain transactions (voting) will fail.' },
    { name: 'CONTRACT_ADDRESS', warn: 'Smart contract interactions will fail.' }
];

let hasFatalError = false;
expectedEnvVars.forEach(v => {
    if (!process.env[v.name] || String(process.env[v.name]).trim() === '') {
        if (v.required) {
            console.error(`❌ Missing REQUIRED: ${v.name} -> ${v.warn}`);
            hasFatalError = true;
        } else if (v.name === 'DB_PASS') {
            console.log(`ℹ️  Missing DB_PASS -> defaulting to empty string`);
        } else if (v.default !== undefined) {
            console.log(`ℹ️  Missing ${v.name} -> defaulting to '${v.default}'`);
        } else {
            console.log(`⚠️  Missing ${v.name} -> ${v.warn}`);
        }
    } else {
        const val = process.env[v.name];
        // Obscure sensitive keys for logs
        const displayVal = (v.name.includes('KEY') || v.name.includes('PASS') || v.name.includes('SALT'))
            ? '********'
            : val;
        console.log(`✅ ${v.name} is configured (${displayVal})`);
    }
});

if (hasFatalError) {
    console.error('🛑 Server startup aborted due to missing REQUIRED environment variables. Please check your .env file.\n');
    process.exit(1);
}
console.log('--------------------------------------\n');

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

// ── reCAPTCHA Server-Side Verification ───────────────────────────────
// Google test secret always passes — swap RECAPTCHA_SECRET in .env for production
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ9GsSRy6';

async function verifyRecaptcha(token) {
    if (!token) return false;
    try {
        const response = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${token}`
        );
        return response.data && response.data.success === true;
    } catch (err) {
        console.error('⚠️ reCAPTCHA verify error:', err.message);
        return false;
    }
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

app.post('/api/login', async (req, res) => {
    const { username, password, recaptchaToken } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    // Verify reCAPTCHA
    const captchaOk = await verifyRecaptcha(recaptchaToken);
    if (!captchaOk) return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });

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

app.post('/api/register', async (req, res) => {
    const { username, password, name, email, recaptchaToken } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    // Verify reCAPTCHA
    const captchaOk = await verifyRecaptcha(recaptchaToken);
    if (!captchaOk) return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });

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

// IN-MEMORY STORE: (Do not use in production! Use Redis or a Database)
// Structure: { "VOT-100001": { otp: "123456", expiresAt: 167888... } }
const otpStore = {};

app.post('/api/voter/generate-otp', async (req, res) => {
    const { voterId } = req.body;
    if (!voterId) return res.status(400).json({ error: "Voter ID is required" });

    try {
        const voters = await dbQuery('SELECT * FROM voters WHERE voter_id = ?', [voterId]);
        if (!voters || voters.length === 0) {
            return res.status(404).json({ error: 'Invalid Voter ID.' });
        }

        const voter = voters[0];
        if (!voter.mobile_no) {
            return res.status(400).json({ error: 'No mobile number registered for this Voter ID.' });
        }

        // 1. Generate a 6-digit random number
        const otp = crypto.randomInt(100000, 999999).toString();

        // 2. Set expiration time (e.g., 5 minutes from now)
        const expiresAt = Date.now() + 5 * 60 * 1000;

        // 3. Store it
        otpStore[voterId] = { otp, expiresAt };

        // 4. Send via 2Factor.in
        if (process.env.TWOFACTOR_API_KEY) {
            try {
                const response = await axios.get(
                    `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/+91${voter.mobile_no}/${otp}/OTP1`
                );

                if (response.data && response.data.Status === 'Success') {
                    console.log(`\n📲 [2FACTOR] OTP sent successfully to ${voter.mobile_no} | Session: ${response.data.Details}\n`);
                } else {
                    throw new Error(response.data?.Details || '2Factor API failed');
                }

            } catch (smsErr) {
                console.error('\n⚠️ 2Factor SMS Error:', smsErr.message);
                console.log(`Fallback: 📲 [SMS SIMULATOR] Sent OTP [ ${otp} ] to +91 ${voter.mobile_no} (Voter: ${voter.full_name})\n`);
            }
        } else {
            console.log(`\n📲 [SMS SIMULATOR] Sent OTP [ ${otp} ] to +91 ${voter.mobile_no} (Voter: ${voter.full_name})\n`);
            console.log(`   (Add TWOFACTOR_API_KEY to .env to send real SMS)`);
        }

        res.json({ success: true, message: "OTP generated and sent successfully!" });
    } catch (err) {
        console.error('OTP generate error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/voter/verify-otp', (req, res) => {
    const { voterId, otp } = req.body;
    if (!voterId || !otp) return res.status(400).json({ error: "Voter ID and OTP are required" });

    const record = otpStore[voterId];

    // Check 1: Does the record exist?
    if (!record) {
        return res.status(400).json({ error: "No OTP found or OTP expired" });
    }

    // Check 2: Is it expired?
    if (Date.now() > record.expiresAt) {
        delete otpStore[voterId]; // Clean up expired OTP
        return res.status(400).json({ error: "OTP has expired" });
    }

    // Check 3: Does it match?
    if (record.otp === otp) {
        // Success! Clean up the OTP so it can't be used again
        delete otpStore[voterId];
        return res.json({ success: true, message: "OTP verified successfully!" });
    } else {
        return res.status(400).json({ error: "Invalid OTP" });
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
                mobile_no: voter.mobile_no,
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

        // Trigger processing immediately in the background
        processPendingVotes();

    } catch (err) {
        console.error('Vote submission error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── Get real-time vote confirmation status ───────────────
app.get('/api/vote/status/:voterId', async (req, res) => {
    const { voterId } = req.params;
    try {
        const rows = await dbQuery(
            "SELECT status, tx_hash FROM vote_queue WHERE voter_id = ? ORDER BY created_at DESC LIMIT 1",
            [voterId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Vote not found' });
        }

        res.json({ status: rows[0].status, tx_hash: rows[0].tx_hash });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

// ═══════════════════════════════════════════════════════════
//   BLOCKCHAIN VOTE PROCESSOR (BACKGROUND WORKER)
// ═══════════════════════════════════════════════════════════
const { ethers } = require('ethers');

// Full ABI matching Voting.sol
const VotingABI = [
    "function castVote(string memory _voterHash, uint256 _electionId, string memory _candidate) public",
    "function hasVoted(string memory, uint256) public view returns (bool)",
    "function getTotalVotes() public view returns (uint256)",
    "event VoteCast(string indexed voterHash, uint256 indexed electionId, string candidate, uint256 timestamp)"
];

let isProcessingVotes = false;

async function processPendingVotes() {
    if (isProcessingVotes) return;
    isProcessingVotes = true;

    try {
        const pendingVotes = await dbQuery("SELECT * FROM vote_queue WHERE status = 'queued' ORDER BY created_at ASC");

        if (pendingVotes.length === 0) {
            isProcessingVotes = false;
            return;
        }

        console.log(`\n⏳ [BLOCKCHAIN] Found ${pendingVotes.length} pending votes to process...`);

        if (!process.env.POLYGON_RPC_URL || !process.env.RELAYER_PRIVATE_KEY || !process.env.CONTRACT_ADDRESS) {
            console.error('⚠️ [BLOCKCHAIN] Missing RPC, Private Key, or Contract Address. Votes remain queued.');
            isProcessingVotes = false;
            return;
        }

        const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
        const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
        const votingContract = new ethers.Contract(process.env.CONTRACT_ADDRESS, VotingABI, wallet);

        let currentNonce = await wallet.getNonce();

        for (const vote of pendingVotes) {
            try {
                console.log(`\n👉 Submitting Hash: ${vote.blockchain_hash} for Candidate: ${vote.candidate}`);

                // ✅ Check if already on-chain BEFORE submitting (correct mapping call)
                const alreadyOnChain = await votingContract.hasVoted(vote.blockchain_hash, vote.election_id);
                if (alreadyOnChain) {
                    console.log(`⚠️  Vote ID ${vote.id} already exists on-chain — marking as done.`);
                    await dbQuery(
                        "UPDATE vote_queue SET status = 'done', tx_hash = 'ALREADY_ON_CHAIN' WHERE id = ?",
                        [vote.id]
                    );
                    continue; // Skip to next vote, don't increment nonce
                }

                // Mark as processing
                await dbQuery("UPDATE vote_queue SET status = 'processing' WHERE id = ?", [vote.id]);

                // Submit to blockchain
                const tx = await votingContract.castVote(
                    vote.blockchain_hash,
                    vote.election_id,
                    vote.candidate,
                    { nonce: currentNonce }
                );

                console.log(`⏱️ Waiting for TX: ${tx.hash}`);
                const receipt = await tx.wait();

                await dbQuery(
                    "UPDATE vote_queue SET status = 'done', tx_hash = ? WHERE id = ?",
                    [receipt.hash, vote.id]
                );

                console.log(`✅ Vote saved to blockchain! TX: ${receipt.hash}`);
                currentNonce++;

            } catch (txError) {
                console.error(`❌ Blockchain TX Failed for Vote ID ${vote.id}:`, txError.message);

                if (txError.message && (txError.message.includes("already cast") || txError.message.includes("revert"))) {
                    console.log(`⚠️ Vote ID ${vote.id} reverted — already on-chain. Marking done.`);
                    await dbQuery(
                        "UPDATE vote_queue SET status = 'done', tx_hash = 'ALREADY_EXISTS_ON_CHAIN' WHERE id = ?",
                        [vote.id]
                    );
                } else {
                    await dbQuery("UPDATE vote_queue SET status = 'failed' WHERE id = ?", [vote.id]);
                }
            }
        }
    } catch (err) {
        console.error('❌ Vote Processor Error:', err.message);
    } finally {
        isProcessingVotes = false;

        // Check if more votes arrived while processing
        dbQuery("SELECT COUNT(*) as count FROM vote_queue WHERE status = 'queued'").then(res => {
            if (res[0].count > 0) processPendingVotes();
        });
    }
}

// ✅ Run worker on server startup to catch any stuck queued votes
setTimeout(() => {
    console.log('\n🚀 [BLOCKCHAIN] Running startup vote processor...');
    processPendingVotes();
}, 3000); // Wait 3s for DB connection to stabilize

// ✅ Also poll every 60 seconds as a safety net
setInterval(() => {
    dbQuery("SELECT COUNT(*) as count FROM vote_queue WHERE status IN ('queued', 'failed')")
        .then(res => {
            if (res[0].count > 0) {
                console.log(`\n🔄 [BLOCKCHAIN] Polling: Found ${res[0].count} unprocessed vote(s)...`);
                processPendingVotes();
            }
        })
        .catch(() => { });
}, 60000);

// Expose contract address publicly so frontend can auto-fill it
app.get('/api/config/contract', (req, res) => {
    res.json({ contractAddress: process.env.CONTRACT_ADDRESS || null });
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
//   AUTO-REJECT BACKGROUND WORKER
//   Complaints still 'pending' after 10 minutes → auto-rejected
// ═══════════════════════════════════════════════════════════

const AUTO_REJECT_MINUTES = 10;

async function autoRejectStalePendingComplaints() {
    try {
        const result = await dbQuery(
            `UPDATE complaints
             SET status = 'reject'
             WHERE status = 'pending'
               AND created_at <= NOW() - INTERVAL ${AUTO_REJECT_MINUTES} MINUTE`
        );
        if (result.affectedRows > 0) {
            console.log(`⏰ [AUTO-REJECT] ${result.affectedRows} complaint(s) auto-rejected after ${AUTO_REJECT_MINUTES}-min deadline.`);
        }
    } catch (err) {
        console.error('⚠️ [AUTO-REJECT] Worker error:', err.message);
    }
}

// Run every 60 seconds
setInterval(autoRejectStalePendingComplaints, 60 * 1000);
console.log(`⏰ [AUTO-REJECT] Worker started — complaints auto-rejected after ${AUTO_REJECT_MINUTES} min of no official response.`);

// Manual trigger endpoint (useful for testing)
app.post('/api/admin/auto-reject-pending', async (req, res) => {
    try {
        const result = await dbQuery(
            `UPDATE complaints
             SET status = 'reject'
             WHERE status = 'pending'
               AND created_at <= NOW() - INTERVAL ${AUTO_REJECT_MINUTES} MINUTE`
        );
        res.json({
            success: true,
            autoRejected: result.affectedRows,
            message: `${result.affectedRows} stale complaint(s) auto-rejected.`
        });
    } catch (err) {
        res.status(500).json({ error: 'Auto-reject failed: ' + err.message });
    }
});


// ═══════════════════════════════════════════════════════════
//   COMPLAINTS ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/complaint', async (req, res) => {
    const { userId, region, area, landmark, department, level, title, description } = req.body;
    if (!userId || !region || !department || !level || !title || !description) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const validLevels = ['low', 'medium', 'high', 'critical'];
    if (!validLevels.includes(level)) return res.status(400).json({ error: 'Invalid level' });

    // Build enriched description with location details
    const areaInfo = area ? `\n📍 Area: ${area}` : '';
    const landmarkInfo = landmark ? `\n🏛️ Landmark: ${landmark}` : '';
    const fullDescription = description + areaInfo + landmarkInfo;

    try {
        const result = await dbQuery(
            'INSERT INTO complaints (user_id, region, department, level, title, description) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, region, department, level, title, fullDescription]
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


// ═══════════════════════════════════════════════════════════
//   ADMIN ROUTES (Development Only)
// ═══════════════════════════════════════════════════════════

app.delete('/api/admin/cleanup-queue', async (req, res) => {
    const { ids, status } = req.body;

    try {
        let result;
        if (ids && Array.isArray(ids) && ids.length > 0) {
            result = await dbQuery('DELETE FROM vote_queue WHERE id IN (?)', [ids]);
            res.json({ success: true, message: `Deleted ${result.affectedRows} vote(s) from queue`, deleted: ids });
        } else if (status) {
            result = await dbQuery('DELETE FROM vote_queue WHERE status = ?', [status]);
            res.json({ success: true, message: `Deleted all '${status}' votes from queue`, affectedRows: result.affectedRows });
        } else {
            res.status(400).json({ error: 'Provide either ids (array) or status (string)' });
        }
    } catch (err) {
        console.error('Cleanup queue error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/admin/reset-voter', async (req, res) => {
    const { voterId } = req.body;
    if (!voterId) return res.status(400).json({ error: 'voterId is required' });

    try {
        await dbQuery('UPDATE voters SET has_voted = FALSE, voted_party = NULL, voted_at = NULL WHERE voter_id = ?', [voterId]);
        await dbQuery('DELETE FROM vote_queue WHERE voter_id = ?', [voterId]);
        res.json({ success: true, message: `Voter ${voterId} has been reset successfully` });
    } catch (err) {
        console.error('Reset voter error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
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
