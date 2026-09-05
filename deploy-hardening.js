const fs = require('fs');
const target = process.argv[2] || '/src/backend/server.js';
let source = fs.readFileSync(target, 'utf8');

source = source.replace("const crypto = require('crypto');\n", '');

const oldTimestamp = "const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);";
const newTimestamp = [
  "const now = new Date();",
  "  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);",
  "  const part = type => parts.find(p => p.type === type).value;",
  "  const timestamp = `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}${part('second')}`;"
].join('\n');
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

const securityAnchor = "const app = express();";
const securityBlock = `const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const authAttemptBuckets = new Map();
function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;
  const bucket = authAttemptBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    authAttemptBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (bucket.count >= maxAttempts) {
    const retryAfter = Math.ceil((bucket.startedAt + windowMs - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ message: 'Too many authentication attempts. Please try again later.' });
  }
  bucket.count += 1;
  return next();
}
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, bucket] of authAttemptBuckets) {
    if (bucket.startedAt < cutoff) authAttemptBuckets.delete(key);
  }
}, 15 * 60 * 1000).unref();`;
if (!source.includes(securityAnchor)) {
  throw new Error('Expected Express initialization was not found; refusing to build.');
}
source = source.replace(securityAnchor, securityBlock);

const loginAnchor = "app.post('/api/auth/login', async (req, res) => {";
if (!source.includes(loginAnchor)) {
  throw new Error('Expected login route was not found; refusing to build.');
}
source = source.replace(loginAnchor, "app.post('/api/auth/login', authRateLimit, async (req, res) => {");

const registerAnchor = "app.post('/api/auth/register', async (req, res) => {";
if (!source.includes(registerAnchor)) {
  throw new Error('Expected registration route was not found; refusing to build.');
}
source = source.replace(registerAnchor, "app.post('/api/auth/register', authRateLimit, async (req, res) => {");

fs.writeFileSync(target, source);
console.log('Applied JazaMart hardening: Nairobi M-Pesa timestamp, configured account reference, security headers, reduced fingerprinting, and authentication rate limiting.');
