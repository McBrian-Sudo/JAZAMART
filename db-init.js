const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL. Copy backend/.env.example to backend/.env and configure PostgreSQL.');
  }
  const schemaPath = path.join(__dirname, 'sql', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log('JazaMart database schema initialized successfully.');
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Database initialization failed:', error.message);
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(error.message)) {
    console.error('Check that PostgreSQL is running and DATABASE_URL points to the correct host/port.');
  }
  process.exit(1);
});
