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
    console.log('Connected to MySQL.');

    db.query("UPDATE vote_queue SET status = 'queued' WHERE status IN ('failed', 'processing')", (err, results) => {
        if (err) {
            console.error('Update failed:', err.message);
        } else {
            console.log(`Reset ${results.affectedRows} failed votes back to queued.`);
        }
        db.end();
        process.exit(0);
    });
});
