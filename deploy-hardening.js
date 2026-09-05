const fs = require('fs');
const target = process.argv[2] || '/src/backend/server.js';
let source = fs.readFileSync(target, 'utf8');

source = source.replace("const crypto = require('crypto');\n", '');

const oldTimestamp = "const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);";
const newTimestamp = `const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  const timestamp = \`${'${part(\'year\')}${part(\'month\')}${part(\'day\')}${part(\'hour\')}${part(\'minute\')}${part(\'second\')}'}\`;`;
if (!source.includes(oldTimestamp)) {
  throw new Error('Expected M-Pesa timestamp code was not found; refusing to build.');
}
source = source.replace(oldTimestamp, newTimestamp);

const oldReference = "accountReference: `JM${order.id.slice(0, 8)}`";
const newReference = "accountReference: `${MPESA_ACCOUNT_REFERENCE}-${order.id.slice(0, 8)}`";
if (!source.includes(oldReference)) {
  throw new Error('Expected M-Pesa account reference code was not found; refusing to build.');
}
source = source.replace(oldReference, newReference);

fs.writeFileSync(target, source);
console.log('Applied JazaMart M-Pesa sandbox hardening: Nairobi timestamp, configured account reference, unused import removal.');
