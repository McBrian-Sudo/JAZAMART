const fs = require('fs');
const path = require('path');

const REQUIRED_TABLES = {
  users: ['id', 'name', 'email', 'password_hash', 'role', 'created_at'],
  categories: ['id', 'name', 'slug'],
  products: ['id', 'seller_id', 'category_id', 'name', 'description', 'price', 'stock', 'image_url', 'is_active', 'created_at'],
  addresses: ['id', 'user_id', 'full_name', 'phone', 'county', 'town', 'address_line', 'created_at'],
  orders: ['id', 'user_id', 'address_id', 'status', 'total', 'created_at'],
  order_items: ['id', 'order_id', 'product_id', 'seller_id', 'quantity', 'unit_price'],
  payments: ['id', 'order_id', 'method', 'status', 'transaction_reference', 'amount', 'created_at'],
  order_status_history: ['id', 'order_id', 'status', 'changed_by', 'note', 'created_at'],
  reviews: ['id', 'product_id', 'user_id', 'rating', 'comment', 'is_approved', 'created_at']
};

async function checkDatabase(pool) {
  const result = {
    ok: false,
    database: { connected: false, name: null },
    extension: { pgcrypto: false },
    tables: {},
    missing: [],
    schemaFile: path.join(__dirname, 'sql', 'schema.sql')
  };

  try {
    const db = await pool.query('SELECT current_database() AS name');
    result.database.connected = true;
    result.database.name = db.rows[0].name;
  } catch (error) {
    result.missing.push({ type: 'database', name: 'PostgreSQL connection', error: error.message });
    return result;
  }

  try {
    const ext = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'");
    result.extension.pgcrypto = ext.rowCount > 0;
    if (!result.extension.pgcrypto) {
      result.missing.push({ type: 'extension', name: 'pgcrypto', fix: 'CREATE EXTENSION IF NOT EXISTS pgcrypto;' });
    }
  } catch (error) {
    result.missing.push({ type: 'extension', name: 'pgcrypto', error: error.message });
  }

  const tableNames = Object.keys(REQUIRED_TABLES);
  const tableRows = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [tableNames]
  );
  const existingTables = new Set(tableRows.rows.map(r => r.table_name));

  for (const [table, columns] of Object.entries(REQUIRED_TABLES)) {
    if (!existingTables.has(table)) {
      result.tables[table] = { exists: false, missingColumns: columns };
      result.missing.push({ type: 'table', name: table, fix: 'Run: npm run db:init' });
      continue;
    }

    const colRows = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table]
    );
    const existingColumns = new Set(colRows.rows.map(r => r.column_name));
    const missingColumns = columns.filter(c => !existingColumns.has(c));
    result.tables[table] = { exists: true, missingColumns };
    for (const column of missingColumns) {
      result.missing.push({ type: 'column', name: `${table}.${column}`, fix: 'Run: npm run db:init (or apply the matching ALTER TABLE manually)' });
    }
  }

  result.ok = result.database.connected && result.missing.length === 0;
  return result;
}

function printReport(report) {
  console.log('\n=== JazaMart Database Check ===');
  console.log(`Database: ${report.database.connected ? `OK (${report.database.name})` : 'FAILED'}`);
  console.log(`pgcrypto: ${report.extension.pgcrypto ? 'OK' : 'MISSING'}`);

  for (const [table, info] of Object.entries(report.tables)) {
    if (!info.exists) console.log(`Table ${table}: MISSING`);
    else if (info.missingColumns.length) console.log(`Table ${table}: OK, missing columns: ${info.missingColumns.join(', ')}`);
    else console.log(`Table ${table}: OK`);
  }

  if (report.ok) {
    console.log('Schema status: OK');
    console.log('================================\n');
    return;
  }

  console.error('\nSchema status: INCOMPLETE');
  for (const item of report.missing) {
    console.error(`- ${item.type}: ${item.name}${item.error ? ` — ${item.error}` : ''}`);
    if (item.fix) console.error(`  Fix: ${item.fix}`);
  }
  console.error(`\nSchema file: ${report.schemaFile}`);
  console.error('================================\n');
}

module.exports = { checkDatabase, printReport };
