require('dotenv').config();
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'jansetu'
});

db.connect((err) => {
    if (err) {
        console.error('MySQL connection failed:', err.message);
        process.exit(1);
    }

    // 1. Delete stuck queue items
    db.query("DELETE FROM vote_queue WHERE status = 'queued' AND id IN (2, 3, 4)", (err, results) => {
        if (err) console.error(err.message);
        else console.log(`Deleted ${results.affectedRows} stuck votes from queue.`);

        // 2. Reset the affected voters so user can test again
        db.query("UPDATE voters SET has_voted = FALSE, voted_party = NULL, voted_at = NULL WHERE voter_id IN ('VOT-100002', 'VOT-100003')", (err2, results2) => {
            if (err2) console.error(err2.message);
            else console.log(`Reset ${results2.affectedRows} voters.`);

            db.end();
            process.exit(0);
        });
    });
});
