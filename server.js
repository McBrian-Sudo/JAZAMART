const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { checkDatabase, printReport } = require('./db-check');

dotenv.config();
const app = express();

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. JazaMart will start, but database-backed features will be unavailable until PostgreSQL is configured.');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-secret-in-production') {
  console.warn('Warning: JWT_SECRET is using the development fallback. Set a strong secret in backend/.env for production.');
}
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => {
  if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return cb(null, true);
  cb(new Error('CORS origin not allowed'));
}, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');


const MPESA_ENV = (process.env.MPESA_ENV || 'sandbox').toLowerCase();
const MPESA_BASE_URL = MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || '';
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || '';
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '';
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || '';
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || `${process.env.PUBLIC_SITE_URL || 'http://localhost:5000'}/api/mpesa/callback`;
const MPESA_ACCOUNT_REFERENCE = process.env.MPESA_ACCOUNT_REFERENCE || 'JazaMart';
const MPESA_TRANSACTION_DESC = process.env.MPESA_TRANSACTION_DESC || 'JazaMart order payment';
const MPESA_TRANSACTION_TYPE = process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline';

function mpesaConfigured() {
  return Boolean(MPESA_CONSUMER_KEY && MPESA_CONSUMER_SECRET && MPESA_SHORTCODE && MPESA_PASSKEY && MPESA_CALLBACK_URL);
}
function normalizeMpesaPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^2547\d{8}$/.test(digits) || /^2541\d{8}$/.test(digits)) return digits;
  if (/^07\d{8}$/.test(digits) || /^01\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^7\d{8}$/.test(digits) || /^1\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}
async function mpesaAccessToken() {
  if (!mpesaConfigured()) throw new Error('M-Pesa is not configured on the server');
  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await fetch(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Could not obtain M-Pesa access token');
  return data.access_token;
}
async function initiateMpesaStk({ amount, phone, accountReference, transactionDesc }) {
  const token = await mpesaAccessToken();
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
  const response = await fetch(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: MPESA_TRANSACTION_TYPE,
      Amount: Math.max(1, Math.round(Number(amount))),
      PartyA: phone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: String(accountReference).slice(0, 12),
      TransactionDesc: String(transactionDesc).slice(0, 13)
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ResponseCode !== '0' || !data.CheckoutRequestID) {
    const err = new Error(data.errorMessage || data.ResponseDescription || data.ResponseDesc || 'M-Pesa STK Push failed');
    err.mpesa = data;
    throw err;
  }
  return data;
}

app.get('/', (req, res) => {
  if (fs.existsSync(frontendDist)) return res.sendFile(path.join(frontendDist, 'index.html'));
  res.json({ message: 'Welcome to JazaMart API 🚀', version: '2.1.0' });
});
app.get('/api/health', async (req, res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ ok: false, database: 'not_configured' });
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch (e) { res.status(503).json({ ok: false, database: 'disconnected', error: process.env.NODE_ENV === 'production' ? 'Database unavailable' : e.message }); }
});

function sign(user) { return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' }); }
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission to perform this action' });
    next();
  };
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid or expired token' }); }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'customer' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const normalized = email.trim().toLowerCase();
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [normalized]);
    if (exists.rowCount) return res.status(409).json({ message: 'Email is already registered' });
    const safeRole = ['customer', 'seller'].includes(role) ? role : 'customer';
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,created_at', [name.trim(), normalized, hash, safeRole]);
    res.status(201).json({ user: r.rows[0], token: sign(r.rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalized = (email || '').trim().toLowerCase();
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [normalized]);
    if (!r.rowCount || !(await bcrypt.compare(password || '', r.rows[0].password_hash))) return res.status(401).json({ message: 'Invalid email or password' });
    const { id, name, role, created_at } = r.rows[0];
    const user = { id, name, email: normalized, role, created_at };
    res.json({ user, token: sign(user) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Login failed' }); }
});

app.get('/api/me', auth, async (req, res) => {
  const r = await pool.query('SELECT id,name,email,role,created_at FROM users WHERE id=$1', [req.user.id]);
  if (!r.rowCount) return res.status(404).json({ message: 'User not found' });
  res.json(r.rows[0]);
});

app.get('/api/products', async (req, res) => {
  const r = await pool.query(`SELECT p.*, c.name AS category_name
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.is_active=true ORDER BY p.created_at DESC`);
  res.json(r.rows);
});
app.get('/api/products/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT p.*, c.name AS category_name, u.name AS seller_name,
      COALESCE((SELECT AVG(rating) FROM reviews WHERE product_id=p.id AND is_approved=true),0) AS rating_average,
      (SELECT COUNT(*)::int FROM reviews WHERE product_id=p.id AND is_approved=true) AS review_count
      FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN users u ON u.id=p.seller_id
      WHERE p.id=$1 AND p.is_active=true`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ message: 'Product not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(400).json({ message: 'Invalid product ID' }); }
});
app.get('/api/categories', async (req, res) => {
  const r = await pool.query('SELECT * FROM categories ORDER BY name');
  res.json(r.rows);
});
app.get('/api/seller/dashboard', auth, requireRole('seller'), async (req, res) => {
  const [products, orders, sales] = await Promise.all([
    pool.query(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.seller_id=$1 ORDER BY p.created_at DESC`, [req.user.id]),
    pool.query(`SELECT o.id,o.status,o.total,o.created_at,COALESCE(SUM(oi.quantity*oi.unit_price),0) AS seller_total,a.full_name,a.phone,a.county,a.town,a.address_line,
      COALESCE(json_agg(json_build_object('product_id',oi.product_id,'name',p.name,'quantity',oi.quantity,'unit_price',oi.unit_price)) FILTER (WHERE oi.id IS NOT NULL),'[]') AS items
      FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id LEFT JOIN addresses a ON a.id=o.address_id
      WHERE oi.seller_id=$1 GROUP BY o.id,a.id ORDER BY o.created_at DESC`, [req.user.id]),
    pool.query(`SELECT COALESCE(SUM(oi.quantity*oi.unit_price),0) AS revenue, COALESCE(SUM(oi.quantity),0) AS units, COUNT(DISTINCT oi.order_id) AS orders FROM order_items oi WHERE oi.seller_id=$1`, [req.user.id])
  ]);
  res.json({ products: products.rows, orders: orders.rows, stats: sales.rows[0] });
});

app.post('/api/seller/products', auth, requireRole('seller'), async (req, res) => {
  try {
    const { name, description='', price, stock=0, category_id=null, image_url=null } = req.body;
    const n=String(name||'').trim(), priceNum=Number(price), stockNum=Number(stock);
    if (!n || !Number.isFinite(priceNum) || priceNum < 0 || !Number.isInteger(stockNum) || stockNum < 0) return res.status(400).json({ message:'Name, valid price and non-negative stock are required' });
    const r=await pool.query(`INSERT INTO products(seller_id,name,description,price,stock,category_id,image_url) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [req.user.id,n,String(description),priceNum,stockNum,category_id||null,image_url||null]);
    res.status(201).json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({message:'Could not create product'}); }
});

app.put('/api/seller/products/:id', auth, requireRole('seller'), async (req, res) => {
  try {
    const { name, description='', price, stock, category_id=null, image_url=null, is_active=true }=req.body;
    const cleanName=String(name||'').trim(), priceNum=Number(price), stockNum=Number(stock);
    if (!cleanName || !Number.isFinite(priceNum) || priceNum < 0 || !Number.isInteger(stockNum) || stockNum < 0) {
      return res.status(400).json({message:'Name, valid price and non-negative stock are required'});
    }
    const r=await pool.query(`UPDATE products SET name=$1,description=$2,price=$3,stock=$4,category_id=$5,image_url=$6,is_active=$7 WHERE id=$8 AND seller_id=$9 RETURNING *`, [cleanName,String(description),priceNum,stockNum,category_id||null,image_url||null,Boolean(is_active),req.params.id,req.user.id]);
    if(!r.rowCount) return res.status(404).json({message:'Product not found'});
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({message:'Could not update product'}); }
});

app.delete('/api/seller/products/:id', auth, requireRole('seller'), async (req, res) => {
  try { const r=await pool.query('UPDATE products SET is_active=false WHERE id=$1 AND seller_id=$2 RETURNING id',[req.params.id,req.user.id]); if(!r.rowCount)return res.status(404).json({message:'Product not found'}); res.json({ok:true}); }
  catch(e){console.error(e);res.status(500).json({message:'Could not delete product'});} 
});

app.patch('/api/seller/orders/:id/status', auth, requireRole('seller'), async (req, res) => {
  const allowed=['processing','shipped','out_for_delivery','delivered','cancelled'];
  const {status}=req.body;
  if(!allowed.includes(status)) return res.status(400).json({message:'Invalid order status'});
  const r=await pool.query(`UPDATE orders SET status=$1 WHERE id=$2 AND EXISTS (SELECT 1 FROM order_items WHERE order_id=orders.id AND seller_id=$3) RETURNING id,status`,[status,req.params.id,req.user.id]);
  if (r.rowCount) await pool.query(`INSERT INTO order_status_history(order_id,status,changed_by,note) VALUES($1,$2,$3,'Updated by seller')`,[req.params.id,status,req.user.id]);
  if(!r.rowCount)return res.status(404).json({message:'Order not found'});
  res.json(r.rows[0]);
});


// Customer addresses
app.get('/api/addresses', auth, async (req, res) => {
  const r = await pool.query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(r.rows);
});
app.post('/api/addresses', auth, async (req, res) => {
  try {
    const { full_name, phone, county, town, address_line } = req.body;
    if (![full_name, phone, county, town, address_line].every(v => String(v || '').trim())) {
      return res.status(400).json({ message: 'All delivery address fields are required' });
    }
    const r = await pool.query(`INSERT INTO addresses(user_id,full_name,phone,county,town,address_line)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [req.user.id, full_name.trim(), phone.trim(), county.trim(), town.trim(), address_line.trim()]);
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Could not save address' }); }
});

// Checkout: prices and stock are always read from PostgreSQL, never trusted from the browser.
app.post('/api/orders', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { address_id, items, payment_method = 'mpesa' } = req.body;
    if (!address_id || !Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Delivery address and cart items are required' });
    if (!['mpesa', 'cash_on_delivery'].includes(payment_method)) return res.status(400).json({ message: 'Unsupported payment method' });
    if (payment_method === 'mpesa' && !mpesaConfigured()) return res.status(503).json({ message: 'M-Pesa payments are not configured yet. Please use Cash on Delivery or try again later.' });

    await client.query('BEGIN');
    const address = await client.query('SELECT id,phone FROM addresses WHERE id=$1 AND user_id=$2', [address_id, req.user.id]);
    if (!address.rowCount) { await client.query('ROLLBACK'); return res.status(403).json({ message: 'Invalid delivery address' }); }

    const rawItems = items.map(i => ({ product_id: String(i.product_id || '').trim(), quantity: Number(i.quantity) }));
    if (rawItems.some(i => !i.product_id || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)) {
      await client.query('ROLLBACK'); return res.status(400).json({ message: 'Invalid cart quantities' });
    }
    const quantities = new Map();
    for (const item of rawItems) quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
    const normalizedItems = [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
    if (normalizedItems.some(i => i.quantity > 99)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Maximum quantity per product is 99' }); }

    const ids = normalizedItems.map(i => i.product_id);
    const productResult = await client.query(`SELECT id,name,price,stock,seller_id FROM products WHERE id = ANY($1::uuid[]) AND is_active=true FOR UPDATE`, [ids]);
    const byId = new Map(productResult.rows.map(p => [p.id, p]));
    if (productResult.rowCount !== ids.length) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'One or more products are no longer available' }); }

    let total = 0;
    for (const item of normalizedItems) {
      const p = byId.get(item.product_id);
      if (item.quantity > p.stock) { await client.query('ROLLBACK'); return res.status(409).json({ message: `${p.name} has only ${p.stock} item(s) left in stock` }); }
      total += Number(p.price) * item.quantity;
    }

    const orderResult = await client.query(`INSERT INTO orders(user_id,address_id,status,total) VALUES($1,$2,'pending',$3) RETURNING *`, [req.user.id, address_id, total.toFixed(2)]);
    const order = orderResult.rows[0];
    for (const item of normalizedItems) {
      const p = byId.get(item.product_id);
      await client.query(`INSERT INTO order_items(order_id,product_id,seller_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)`, [order.id, p.id, p.seller_id, item.quantity, p.price]);
      await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2', [item.quantity, p.id]);
    }
    const paymentResult = await client.query(`INSERT INTO payments(order_id,method,status,amount) VALUES($1,$2,'pending',$3) RETURNING id`, [order.id, payment_method, total.toFixed(2)]);
    const paymentId = paymentResult.rows[0].id;
    await client.query(`INSERT INTO order_status_history(order_id,status,changed_by,note) VALUES($1,'pending',$2,$3)`, [order.id, req.user.id, payment_method === 'mpesa' ? 'Order created; awaiting M-Pesa payment' : 'Order created; cash on delivery selected']);
    await client.query('COMMIT');

    if (payment_method === 'cash_on_delivery') {
      return res.status(201).json({ order_id: order.id, payment_id: paymentId, status: order.status, total: order.total, payment_status: 'pending', payment_method });
    }

    const phone = normalizeMpesaPhone(address.rows[0].phone);
    if (!phone) {
      await pool.query(`UPDATE payments SET status='failed',result_code=$1,result_desc=$2 WHERE id=$3`, ['PHONE_INVALID', 'Enter a valid Kenyan M-Pesa phone number', paymentId]);
      await pool.query(`UPDATE orders SET status='cancelled' WHERE id=$1`, [order.id]);
      await pool.query(`UPDATE products p SET stock=p.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.product_id=p.id`, [order.id]);
      await pool.query(`INSERT INTO order_status_history(order_id,status,note) VALUES($1,'cancelled','M-Pesa phone number was invalid')`, [order.id]);
      return res.status(400).json({ message: 'The delivery address phone number is not a valid Kenyan M-Pesa number. Update the address and try again.' });
    }

    try {
      const stk = await initiateMpesaStk({ amount: total, phone, accountReference: `JM${order.id.slice(0, 8)}`, transactionDesc: MPESA_TRANSACTION_DESC });
      await pool.query(`UPDATE payments SET merchant_request_id=$1,checkout_request_id=$2,phone_number=$3,result_code=$4,result_desc=$5 WHERE id=$6`, [stk.MerchantRequestID || null, stk.CheckoutRequestID || null, phone, stk.ResponseCode || null, stk.ResponseDescription || null, paymentId]);
      return res.status(201).json({ order_id: order.id, payment_id: paymentId, status: order.status, total: order.total, payment_status: 'pending', payment_method, stk_status: 'sent' });
    } catch (e) {
      console.error('M-Pesa STK initiation failed:', e.message);
      await pool.query(`UPDATE payments SET status='failed',result_code=$1,result_desc=$2,phone_number=$3 WHERE id=$4`, [String(e.mpesa?.ResponseCode || 'STK_FAILED'), String(e.mpesa?.errorMessage || e.message).slice(0, 500), phone, paymentId]);
      await pool.query(`UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending'`, [order.id]);
      await pool.query(`UPDATE products p SET stock=p.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.product_id=p.id`, [order.id]);
      await pool.query(`INSERT INTO order_status_history(order_id,status,note) VALUES($1,'cancelled','M-Pesa payment request could not be started; stock released')`, [order.id]);
      return res.status(502).json({ message: 'We could not start the M-Pesa payment. Your order was cancelled and stock released. Please try again.' });
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ message: 'Checkout failed' });
  } finally { client.release(); }
});

// Safaricom sends the final STK result here. This route is intentionally public;
// it is protected by HTTPS, strict order/payment correlation and idempotent updates.
app.post('/api/mpesa/callback', async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    const resultCode = String(callback.ResultCode ?? '');
    const resultDesc = String(callback.ResultDesc || '').slice(0, 500);
    const items = Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
    const value = name => items.find(i => i.Name === name)?.Value ?? null;
    const receipt = value('MpesaReceiptNumber');
    const phone = value('PhoneNumber');
    const transactionDate = value('TransactionDate');
    const amount = value('Amount');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const paymentResult = await client.query(`SELECT p.*,o.id AS order_id,o.status AS order_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.checkout_request_id=$1 FOR UPDATE`, [callback.CheckoutRequestID]);
      if (!paymentResult.rowCount) { await client.query('ROLLBACK'); return res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); }
      const payment = paymentResult.rows[0];
      if (['paid','failed','cancelled'].includes(payment.status)) { await client.query('COMMIT'); return res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); }

      const success = resultCode === '0';
      if (success) {
        const expected = Number(payment.amount);
        const received = amount == null ? expected : Number(amount);
        if (!Number.isFinite(received) || Math.abs(received - expected) > 0.01) {
          await client.query(`UPDATE payments SET status='failed',result_code='AMOUNT_MISMATCH',result_desc=$1,callback_payload=$2::jsonb WHERE id=$3`, ['M-Pesa amount did not match the order total', JSON.stringify(req.body), payment.id]);
          await client.query(`UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending'`, [payment.order_id]);
          await client.query(`UPDATE products p SET stock=p.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.product_id=p.id`, [payment.order_id]);
          await client.query(`INSERT INTO order_status_history(order_id,status,note) VALUES($1,'cancelled','M-Pesa callback amount mismatch; stock released')`, [payment.order_id]);
          await client.query('COMMIT');
          return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
        }
        await client.query(`UPDATE payments SET status='paid',transaction_reference=$1,mpesa_receipt_number=$2,result_code=$3,result_desc=$4,phone_number=$5,transaction_date=$6,callback_payload=$7::jsonb,paid_at=NOW() WHERE id=$8`, [receipt, receipt, resultCode, resultDesc, phone ? String(phone) : null, transactionDate ? String(transactionDate) : null, JSON.stringify(req.body), payment.id]);
        await client.query(`UPDATE orders SET status='paid' WHERE id=$1 AND status IN ('pending','paid')`, [payment.order_id]);
        await client.query(`INSERT INTO order_status_history(order_id,status,note) VALUES($1,'paid',$2)`, [payment.order_id, `M-Pesa payment confirmed${receipt ? ` (${receipt})` : ''}`]);
      } else {
        await client.query(`UPDATE payments SET status='failed',result_code=$1,result_desc=$2,phone_number=$3,callback_payload=$4::jsonb WHERE id=$5`, [resultCode, resultDesc, phone ? String(phone) : null, JSON.stringify(req.body), payment.id]);
        await client.query(`UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending'`, [payment.order_id]);
        await client.query(`UPDATE products p SET stock=p.stock+oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.product_id=p.id`, [payment.order_id]);
        await client.query(`INSERT INTO order_status_history(order_id,status,note) VALUES($1,'cancelled',$2)`, [payment.order_id, `M-Pesa payment failed: ${resultDesc}`]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (e) {
    console.error('M-Pesa callback processing failed:', e.message);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Callback processing failed' });
  }
});

app.get('/api/payments/:id', auth, async (req, res) => {
  const r = await pool.query(`SELECT p.id,p.order_id,p.method,p.status,p.amount,p.transaction_reference,p.mpesa_receipt_number,p.result_code,p.result_desc,p.phone_number,p.paid_at FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 AND o.user_id=$2`, [req.params.id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ message: 'Payment not found' });
  res.json(r.rows[0]);
});

app.patch('/api/me', auth, async (req,res)=>{try{const name=String(req.body.name||'').trim();const email=String(req.body.email||'').trim().toLowerCase();if(!name||!email)return res.status(400).json({message:'Name and email are required'});const r=await pool.query('UPDATE users SET name=$1,email=$2 WHERE id=$3 RETURNING id,name,email,role,created_at',[name,email,req.user.id]);res.json({user:r.rows[0]});}catch(e){if(e.code==='23505')return res.status(409).json({message:'Email is already in use'});console.error(e);res.status(500).json({message:'Could not update profile'});}});

app.get('/api/customer/dashboard', auth, requireRole('customer'), async (req,res)=>{
  const [user,stats,orders,addresses,reviews,wishlist]=await Promise.all([
    pool.query('SELECT id,name,email,role,created_at FROM users WHERE id=$1',[req.user.id]),
    pool.query(`SELECT COUNT(*)::int AS orders,COUNT(*) FILTER (WHERE status IN ('pending','paid','processing','shipped','out_for_delivery'))::int AS pending,COUNT(*) FILTER (WHERE status='delivered')::int AS delivered,COALESCE(SUM(total) FILTER (WHERE status<>'cancelled'),0) AS spent FROM orders WHERE user_id=$1`,[req.user.id]),
    pool.query(`SELECT o.id,o.status,o.total,o.created_at FROM orders o WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 20`,[req.user.id]),
    pool.query('SELECT id,full_name,phone,county,town,address_line,created_at FROM addresses WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]),
    pool.query(`SELECT r.id,r.rating,r.comment,r.created_at,p.name AS product_name FROM reviews r JOIN products p ON p.id=r.product_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 20`,[req.user.id]),
    pool.query(`SELECT p.id,p.name,p.price,p.image_url,p.stock,c.name AS category_name FROM wishlist w JOIN products p ON p.id=w.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE w.user_id=$1 ORDER BY w.created_at DESC`,[req.user.id])
  ]);
  res.json({user:user.rows[0],stats:stats.rows[0],orders:orders.rows,addresses:addresses.rows,reviews:reviews.rows,wishlist:wishlist.rows});
});

app.delete('/api/addresses/:id', auth, async (req,res)=>{const r=await pool.query('DELETE FROM addresses WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.user.id]);if(!r.rowCount)return res.status(404).json({message:'Address not found'});res.json({ok:true});});

app.post('/api/wishlist/:productId', auth, requireRole('customer'), async (req,res)=>{try{const existing=await pool.query('SELECT id FROM wishlist WHERE user_id=$1 AND product_id=$2',[req.user.id,req.params.productId]);if(existing.rowCount)await pool.query('DELETE FROM wishlist WHERE id=$1',[existing.rows[0].id]);else await pool.query('INSERT INTO wishlist(user_id,product_id) VALUES($1,$2)',[req.user.id,req.params.productId]);const r=await pool.query(`SELECT p.id,p.name,p.price,p.image_url,p.stock,c.name AS category_name FROM wishlist w JOIN products p ON p.id=w.product_id LEFT JOIN categories c ON c.id=p.category_id WHERE w.user_id=$1 ORDER BY w.created_at DESC`,[req.user.id]);res.json({wishlist:r.rows});}catch(e){if(e.code==='23503')return res.status(404).json({message:'Product not found'});console.error(e);res.status(500).json({message:'Could not update wishlist'});}});

app.get('/api/orders', auth, async (req, res) => {
  const r = await pool.query(`SELECT o.id,o.status,o.total,o.created_at,
      pay.id AS payment_id,pay.method AS payment_method,pay.status AS payment_status,pay.mpesa_receipt_number,
      a.full_name,a.phone,a.county,a.town,a.address_line,
      COALESCE(json_agg(json_build_object('product_id',oi.product_id,'name',p.name,'quantity',oi.quantity,'unit_price',oi.unit_price)) FILTER (WHERE oi.id IS NOT NULL),'[]') AS items
    FROM orders o
    LEFT JOIN addresses a ON a.id=o.address_id
    LEFT JOIN payments pay ON pay.order_id=o.id
    LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN products p ON p.id=oi.product_id
    WHERE o.user_id=$1
    GROUP BY o.id,a.id ORDER BY o.created_at DESC`, [req.user.id]);
  res.json(r.rows);
});

app.get('/api/orders/:id', auth, async (req, res) => {
  const r = await pool.query(`SELECT o.id,o.status,o.total,o.created_at,
      pay.id AS payment_id,pay.method AS payment_method,pay.status AS payment_status,pay.mpesa_receipt_number,
      a.full_name,a.phone,a.county,a.town,a.address_line,
      COALESCE(json_agg(json_build_object('product_id',oi.product_id,'name',p.name,'quantity',oi.quantity,'unit_price',oi.unit_price)) FILTER (WHERE oi.id IS NOT NULL),'[]') AS items
    FROM orders o LEFT JOIN payments pay ON pay.order_id=o.id LEFT JOIN addresses a ON a.id=o.address_id LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id
    WHERE o.id=$1 AND o.user_id=$2 GROUP BY o.id,a.id`, [req.params.id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ message: 'Order not found' });
  res.json(r.rows[0]);
});



// Delivery tracking: every status change is recorded as an immutable timeline event.
app.get('/api/orders/:id/tracking', auth, async (req, res) => {
  const access = await pool.query(`SELECT 1 FROM orders WHERE id=$1 AND (user_id=$2 OR EXISTS (SELECT 1 FROM order_items WHERE order_id=$1 AND seller_id=$2) OR $3='admin')`, [req.params.id, req.user.id, req.user.role]);
  if (!access.rowCount) return res.status(404).json({ message: 'Order not found' });
  const r = await pool.query(`SELECT h.status,h.note,h.created_at,u.name AS changed_by FROM order_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.order_id=$1 ORDER BY h.created_at ASC`, [req.params.id]);
  res.json(r.rows);
});

// Customer reviews: only a delivered order containing the product can be reviewed.
app.get('/api/products/:id/reviews', async (req,res) => {
  const r=await pool.query(`SELECT r.id,r.rating,r.comment,r.created_at,u.name AS user_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=$1 AND r.is_approved=true ORDER BY r.created_at DESC`,[req.params.id]);
  const avg=await pool.query(`SELECT COALESCE(AVG(rating),0) AS average,COUNT(*)::int AS count FROM reviews WHERE product_id=$1 AND is_approved=true`,[req.params.id]);
  res.json({reviews:r.rows,summary:avg.rows[0]});
});
app.post('/api/products/:id/reviews', auth, async (req,res) => {
  const rating=Number(req.body.rating), comment=String(req.body.comment||'').trim();
  if(!Number.isInteger(rating)||rating<1||rating>5) return res.status(400).json({message:'Rating must be between 1 and 5'});
  const eligible=await pool.query(`SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=$1 AND o.user_id=$2 AND o.status='delivered' LIMIT 1`,[req.params.id,req.user.id]);
  if(!eligible.rowCount) return res.status(403).json({message:'You can review a product after it has been delivered to you'});
  try { const r=await pool.query(`INSERT INTO reviews(product_id,user_id,rating,comment) VALUES($1,$2,$3,$4) RETURNING *`,[req.params.id,req.user.id,rating,comment]); res.status(201).json(r.rows[0]); }
  catch(e){ if(e.code==='23505') return res.status(409).json({message:'You have already reviewed this product'}); console.error(e);res.status(500).json({message:'Could not save review'}); }
});

// Admin dashboard and moderation.
app.get('/api/admin/dashboard', auth, requireRole('admin'), async (req,res) => {
  const [stats,orders,sellers,users,products,reviews]=await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*) FROM users WHERE role='customer')::int AS customers,(SELECT COUNT(*) FROM users WHERE role='seller')::int AS sellers,(SELECT COUNT(*) FROM products)::int AS products,(SELECT COUNT(*) FROM orders)::int AS orders,(SELECT COALESCE(SUM(total),0) FROM orders WHERE status<>'cancelled') AS revenue`),
    pool.query(`SELECT o.id,o.status,o.total,o.created_at,u.name AS customer_name,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 50`),
    pool.query(`SELECT id,name,email,created_at FROM users WHERE role='seller' ORDER BY created_at DESC`),
    pool.query(`SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC LIMIT 100`),
    pool.query(`SELECT p.id,p.name,p.price,p.stock,p.is_active,p.created_at,u.name AS seller_name,c.name AS category_name FROM products p JOIN users u ON u.id=p.seller_id LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC LIMIT 100`),
    pool.query(`SELECT r.id,r.rating,r.comment,r.is_approved,r.created_at,p.name AS product_name,u.name AS user_name FROM reviews r JOIN products p ON p.id=r.product_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 100`)
  ]);
  res.json({stats:stats.rows[0],orders:orders.rows,sellers:sellers.rows,users:users.rows,products:products.rows,reviews:reviews.rows});
});
app.patch('/api/admin/orders/:id/status', auth, requireRole('admin'), async (req,res)=>{
  const allowed=['pending','paid','processing','shipped','out_for_delivery','delivered','cancelled'];
  if(!allowed.includes(req.body.status)) return res.status(400).json({message:'Invalid order status'});
  const client=await pool.connect(); try { await client.query('BEGIN'); const old=await client.query('SELECT status FROM orders WHERE id=$1 FOR UPDATE',[req.params.id]); if(!old.rowCount){await client.query('ROLLBACK');return res.status(404).json({message:'Order not found'});} const r=await client.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,status',[req.body.status,req.params.id]); await client.query('INSERT INTO order_status_history(order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',[req.params.id,req.body.status,req.user.id,'Updated by admin']); await client.query('COMMIT'); res.json(r.rows[0]); } catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e);res.status(500).json({message:'Could not update order'});} finally{client.release();}
});
app.patch('/api/admin/reviews/:id', auth, requireRole('admin'), async(req,res)=>{ const r=await pool.query('UPDATE reviews SET is_approved=$1 WHERE id=$2 RETURNING *',[Boolean(req.body.is_approved),req.params.id]); if(!r.rowCount)return res.status(404).json({message:'Review not found'});res.json(r.rows[0]); });
app.patch('/api/admin/products/:id', auth, requireRole('admin'), async(req,res)=>{ const r=await pool.query('UPDATE products SET is_active=$1 WHERE id=$2 RETURNING id,is_active',[Boolean(req.body.is_active),req.params.id]); if(!r.rowCount)return res.status(404).json({message:'Product not found'});res.json(r.rows[0]); });

// SEO: serve a real HTML document for every public product URL so crawlers and
// link-preview bots receive product-specific metadata before JavaScript runs.
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://jazamart.onrender.com').replace(/\/$/, '');
function escHtml(value='') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); }
function productDescription(product) {
  const raw = String(product.description || `Shop ${product.name} on JazaMart Kenya.`).replace(/\s+/g,' ').trim();
  return raw.length > 155 ? raw.slice(0,152).replace(/\s+\S*$/,'') + '...' : raw;
}
async function renderProductShell(req, res, next) {
  if (!fs.existsSync(frontendDist)) return next();
  const match = req.path.match(/^\/product\/([0-9a-fA-F-]{36})$/);
  if (!match) return next();
  try {
    const r = await pool.query(`SELECT p.id,p.name,p.description,p.price,p.image_url,p.created_at,c.name AS category_name,u.name AS seller_name
      FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN users u ON u.id=p.seller_id
      WHERE p.id=$1 AND p.is_active=true`, [match[1]]);
    if (!r.rowCount) return res.status(404).send('Product not found');
    const product = r.rows[0];
    const url = `${SITE_URL}/product/${product.id}`;
    const title = `${product.name} | JazaMart Kenya`;
    const description = productDescription(product);
    const image = product.image_url || `${SITE_URL}/icons/icon-512.png`;
    let html = fs.readFileSync(path.join(frontendDist, 'index.html'), 'utf8');
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escHtml(title)}</title>`);
    const tags = `
<meta name="description" content="${escHtml(description)}"/>
<meta name="robots" content="index,follow,max-image-preview:large"/>
<link rel="canonical" href="${escHtml(url)}"/>
<meta property="og:type" content="product"/>
<meta property="og:title" content="${escHtml(title)}"/>
<meta property="og:description" content="${escHtml(description)}"/>
<meta property="og:url" content="${escHtml(url)}"/>
<meta property="og:image" content="${escHtml(image)}"/>
<meta property="og:site_name" content="JazaMart"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escHtml(title)}"/>
<meta name="twitter:description" content="${escHtml(description)}"/>
<meta name="twitter:image" content="${escHtml(image)}"/>
<script type="application/ld+json">${JSON.stringify({
      '@context':'https://schema.org','@type':'Product',name:product.name,description:description,image:[image],url,sku:String(product.id),brand:{'@type':'Brand',name:'JazaMart'},offers:{'@type':'Offer',url,priceCurrency:'KES',price:Number(product.price),availability:'https://schema.org/InStock'}})}</script>`;
    html = html.replace('</head>', `${tags}\n</head>`);
    res.type('html').send(html);
  } catch (e) { next(e); }
}
app.get('/sitemap.xml', async (req,res,next) => {
  try {
    const r = await pool.query('SELECT id,created_at FROM products WHERE is_active=true ORDER BY created_at DESC');
    const urls = [`  <url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`, ...r.rows.map(p => `  <url><loc>${SITE_URL}/product/${p.id}</loc><lastmod>${new Date(p.created_at).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  } catch(e) { next(e); }
});
app.get('/product/:id', renderProductShell);

// Production single-service mode: if the frontend has been built into ../frontend/dist,
// serve it from the same Express process. API routes remain under /api.
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ message: 'Unexpected server error' }); });
const PORT = process.env.PORT || 5000;

async function startServer() {
  if (process.env.AUTO_INIT_DB === 'true') {
    try {
      const fs = require('fs');
const crypto = require('crypto');
      const schema = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8');
      await pool.query(schema);
      console.log('JazaMart database schema initialized.');
    } catch (error) {
      console.warn('Automatic database initialization failed:', error.message);
    }
  }

  // Do not prevent the HTTP API from starting just because PostgreSQL is
  // temporarily unavailable. This makes local development much easier and
  // lets /api/health report the real database state instead of making the
  // entire app appear offline.
  try {
    const report = await checkDatabase(pool);
    printReport(report);
    if (!report.ok) {
      console.warn('JazaMart API is starting with database warnings. Database-backed features will remain unavailable until PostgreSQL/schema is ready.');
    }
  } catch (error) {
    console.warn('JazaMart startup database check failed:', error.message);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`JazaMart API running on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down JazaMart...`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch(async (error) => {
  console.error('JazaMart startup failed:', error.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
