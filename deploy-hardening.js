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
if (!source.includes(oldTimestamp)) throw new Error('Expected M-Pesa timestamp code was not found; refusing to build.');
source = source.replace(oldTimestamp, newTimestamp);

const oldReference = "accountReference: `JM${order.id.slice(0, 8)}`";
const newReference = "accountReference: `${MPESA_ACCOUNT_REFERENCE}-${order.id.slice(0, 8)}`";
if (!source.includes(oldReference)) throw new Error('Expected M-Pesa account reference code was not found; refusing to build.');
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
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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
  for (const [key, bucket] of authAttemptBuckets) if (bucket.startedAt < cutoff) authAttemptBuckets.delete(key);
}, 15 * 60 * 1000).unref();`;
if (!source.includes(securityAnchor)) throw new Error('Expected Express initialization was not found; refusing to build.');
source = source.replace(securityAnchor, securityBlock);

const oldCors = "app.use(cors());";
const newCors = `const configuredOrigins = (process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || configuredOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
  credentials: true
}));`;
if (!source.includes(oldCors)) throw new Error('Expected CORS initialization was not found; refusing to build.');
source = source.replace(oldCors, newCors);

const loginAnchor = "app.post('/api/auth/login', async (req, res) => {";
if (!source.includes(loginAnchor)) throw new Error('Expected login route was not found; refusing to build.');
source = source.replace(loginAnchor, "app.post('/api/auth/login', authRateLimit, async (req, res) => {");

const registerAnchor = "app.post('/api/auth/register', async (req, res) => {";
if (!source.includes(registerAnchor)) throw new Error('Expected registration route was not found; refusing to build.');
source = source.replace(registerAnchor, "app.post('/api/auth/register', authRateLimit, async (req, res) => {");

const jwtAnchor = "dotenv.config();";
if (!source.includes(jwtAnchor)) throw new Error('Expected dotenv initialization was not found; refusing to build.');
source = source.replace(jwtAnchor, `${jwtAnchor}
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'development-only-change-me')) {
  throw new Error('JWT_SECRET must be configured in production.');
}`);

const tokenLog = "console.log('MPESA TOKEN RESPONSE:',r.status,JSON.stringify(d));";
if (source.includes(tokenLog)) source = source.replace(tokenLog, "console.log('MPESA TOKEN RESPONSE STATUS:', r.status);");
const phoneLog = "console.log('STK PUSH REQUEST:',order_id,phone);";
if (source.includes(phoneLog)) source = source.replace(phoneLog, "console.log('STK PUSH REQUEST:', order_id);");
const payloadLog = "console.log('STK PUSH PAYLOAD:',JSON.stringify(payload));";
if (source.includes(payloadLog)) source = source.replace(payloadLog, "console.log('STK PUSH PAYLOAD PREPARED:', orderRow.id);");
const callbackLog = "console.log('MPESA CALLBACK RECEIVED:',JSON.stringify(req.body));";
if (source.includes(callbackLog)) source = source.replace(callbackLog, "console.log('MPESA CALLBACK RECEIVED');");

const seedStart = "app.get('/api/seed-test-product'";
if (source.includes(seedStart)) {
  const seedIndex = source.indexOf(seedStart);
  const seedEnd = source.indexOf("\n\nconst MPESA_BASE_URL", seedIndex);
  if (seedEnd === -1) throw new Error('Seed endpoint boundary was not found; refusing to build.');
  source = source.slice(0, seedIndex) + source.slice(seedEnd + 2);
}

fs.writeFileSync(target, source);
console.log('Applied JazaMart hardening: Nairobi M-Pesa timestamp, configured account reference, restricted CORS, security headers, reduced fingerprinting, authentication rate limiting, production JWT secret enforcement, M-Pesa log redaction, and public seed endpoint removal.');
