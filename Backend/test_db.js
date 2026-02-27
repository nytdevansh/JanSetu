const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'jansetu'
    });
    const [complaints] = await db.query('SELECT * FROM complaints');
    console.log("Complaints:", complaints);
    db.end();
}
run();
