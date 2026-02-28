require('dotenv').config();
const mysql = require('mysql2');
const { ethers } = require('ethers');

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'jansetu'
});

const VOTING_ABI = [
    "function hasVoted(string memory, uint256) public view returns (bool)",
    "function getTotalVotes() public view returns (uint256)"
];

async function syncChain() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, VOTING_ABI, provider);

    db.query("SELECT * FROM vote_queue WHERE status != 'done'", async (err, votes) => {
        if (err) { console.error(err); db.end(); return; }

        console.log(`Found ${votes.length} non-done votes to check...`);

        for (const vote of votes) {
            try {
                const alreadyOnChain = await contract.hasVoted(vote.blockchain_hash, vote.election_id);
                if (alreadyOnChain) {
                    db.query(
                        "UPDATE vote_queue SET status = 'done', tx_hash = 'SYNCED_FROM_CHAIN' WHERE id = ?",
                        [vote.id],
                        () => console.log(`✅ Vote ID ${vote.id} (${vote.candidate}) — marked done.`)
                    );
                } else {
                    db.query(
                        "UPDATE vote_queue SET status = 'queued' WHERE id = ?",
                        [vote.id],
                        () => console.log(`🔄 Vote ID ${vote.id} (${vote.candidate}) — reset to queued for reprocessing.`)
                    );
                }
            } catch (e) {
                console.error(`❌ Error checking Vote ID ${vote.id}:`, e.message);
            }
        }

        setTimeout(() => db.end(), 2000);
    });
}

syncChain().catch(console.error);