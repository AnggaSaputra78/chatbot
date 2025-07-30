const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Railway kasih env ini otomatis
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
