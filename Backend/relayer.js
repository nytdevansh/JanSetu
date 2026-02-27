/**
 * JanSetu Vote Relayer
 * 
 * Polls the vote_queue table for queued votes, hashes user IDs,
 * and submits them to the Polygon smart contract in batches.
 * 
 * Run: node relayer.js
 * Requires: .env with POLYGON_RPC_URL, RELAYER_PRIVATE_KEY,
 *           CONTRACT_ADDRESS, VOTE_SALT
 */

const mysql = require('mysql2');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────
const POLL_INTERVAL = 10000; // 10 seconds
const MAX_RETRIES = 3;
const BATCH_SIZE = 50;

// Load env vars (use dotenv if available, otherwise process.env)
try { require('dotenv').config(); } catch (e) { /* dotenv not installed */ }

const VOTE_SALT = process.env.VOTE_SALT || 'default_salt_change_me';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || '';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || '';

// ─── Database Connection ─────────────────────────────────
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'jansetu'
});

function dbQuery(sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

// ─── Hash Function ───────────────────────────────────────
function hashUserId(userId) {
    return '0x' + crypto
        .createHash('sha256')
        .update(String(userId) + VOTE_SALT)
        .digest('hex');
}

// ─── Blockchain Submission (stub — requires ethers.js + contract) ─
async function submitToBlockchain(hashedIds, candidates) {
    // If blockchain is not configured, simulate success
    if (!CONTRACT_ADDRESS || !POLYGON_RPC_URL || !RELAYER_PRIVATE_KEY) {
        console.log('  ⚠️  Blockchain not configured — simulating on-chain submission');
        console.log(`  📋 Would submit ${hashedIds.length} votes to contract ${CONTRACT_ADDRESS || '(not set)'}`);

        // Simulate a tx hash
        const fakeTxHash = '0x' + crypto.randomBytes(32).toString('hex');
        return { txHash: fakeTxHash, success: true };
    }

    // Real blockchain submission using ethers.js
    try {
        const { ethers } = require('ethers');

        const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
        const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);

        // Check wallet balance
        const balance = await provider.getBalance(wallet.address);
        const balanceInMatic = ethers.formatEther(balance);
        console.log(`  💰 Relayer wallet balance: ${balanceInMatic} MATIC`);

        if (parseFloat(balanceInMatic) < 0.01) {
            console.error('  ❌ Wallet balance too low! Please fund the relayer.');
            return { txHash: null, success: false };
        }

        // ABI for the submitBatch function
        const abi = [
            'function submitBatch(bytes32[] calldata hashedUserIds, string[] calldata candidates) external'
        ];

        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

        // Convert hex strings to bytes32
        const bytes32Hashes = hashedIds.map(h => ethers.zeroPadValue(h, 32));

        const tx = await contract.submitBatch(bytes32Hashes, candidates);
        console.log(`  ⏳ Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

        return { txHash: tx.hash, success: true };
    } catch (err) {
        console.error('  ❌ Blockchain submission failed:', err.message);
        return { txHash: null, success: false };
    }
}

// ─── Process Vote Queue ──────────────────────────────────
async function processQueue() {
    try {
        // 1. Fetch queued votes
        const queued = await dbQuery(
            'SELECT * FROM vote_queue WHERE status = ? ORDER BY created_at ASC LIMIT ?',
            ['queued', BATCH_SIZE]
        );

        if (!queued || queued.length === 0) {
            return; // Nothing to process
        }

        console.log(`\n📨 Processing ${queued.length} queued vote(s)...`);

        // 2. Lock them to 'processing'
        const ids = queued.map(v => v.id);
        await dbQuery(
            'UPDATE vote_queue SET status = ? WHERE id IN (?)',
            ['processing', ids]
        );

        // 3. Hash user IDs and prepare batch
        const hashedIds = queued.map(v => hashUserId(v.user_id));
        const candidates = queued.map(v => v.candidate);

        console.log(`  🔐 Hashed ${hashedIds.length} user IDs`);

        // 4. Submit to blockchain
        const result = await submitToBlockchain(hashedIds, candidates);

        if (result.success) {
            // 5. Update queue to 'done' and write tx_hash
            await dbQuery(
                'UPDATE vote_queue SET status = ?, tx_hash = ?, blockchain_hash = ? WHERE id IN (?)',
                ['done', result.txHash, hashedIds[0], ids]
            );

            // 6. Update user records
            for (const vote of queued) {
                await dbQuery(
                    'UPDATE users SET vote_status = ?, vote_tx_hash = ? WHERE id = ?',
                    ['confirmed', result.txHash, vote.user_id]
                );
            }

            console.log(`  ✅ ${queued.length} vote(s) confirmed — tx: ${result.txHash}`);

        } else {
            // Failed — increment retry count
            for (const vote of queued) {
                const newRetry = (vote.retry_count || 0) + 1;
                const newStatus = newRetry >= MAX_RETRIES ? 'failed' : 'queued';

                await dbQuery(
                    'UPDATE vote_queue SET status = ?, retry_count = ? WHERE id = ?',
                    [newStatus, newRetry, vote.id]
                );

                if (newStatus === 'failed') {
                    console.error(`  ❌ Vote ${vote.id} permanently failed after ${MAX_RETRIES} retries`);
                }
            }
        }

    } catch (err) {
        console.error('Queue processing error:', err.message);
    }
}

// ─── Main Loop ───────────────────────────────────────────
async function main() {
    console.log(`
    ╔══════════════════════════════════════╗
    ║     🗳️  JanSetu Vote Relayer  🗳️     ║
    ╠══════════════════════════════════════╣
    ║  Polling interval: ${POLL_INTERVAL / 1000}s              ║
    ║  Max retries: ${MAX_RETRIES}                     ║
    ║  Batch size: ${BATCH_SIZE}                     ║
    ║  Contract: ${CONTRACT_ADDRESS ? CONTRACT_ADDRESS.slice(0, 10) + '...' : '(not configured)'}       ║
    ╚══════════════════════════════════════╝
    `);

    // Connect to DB
    await new Promise((resolve, reject) => {
        db.connect((err) => {
            if (err) {
                console.error('⚠️  MySQL connection failed:', err.message);
                reject(err);
            } else {
                console.log('✅ Connected to MySQL database');
                resolve();
            }
        });
    });

    // Process immediately, then on interval
    await processQueue();
    setInterval(processQueue, POLL_INTERVAL);
}

main().catch(err => {
    console.error('Relayer fatal error:', err.message);
    process.exit(1);
});
