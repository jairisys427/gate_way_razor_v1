const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Razorpay = require('razorpay');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// SQLite/Turso client (or use sqlite3 if you prefer)
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Razorpay client
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.use(cors());
app.use(bodyParser.json());

// ---- DB INIT ----
async function initDB() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullName TEXT,
      phone TEXT,
      email TEXT,
      paymentId TEXT,
      orderId TEXT,
      amount TEXT,
      status TEXT,
      date INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      basePrice REAL NOT NULL,
      discountPercentage REAL NOT NULL,
      lastUpdated INTEGER NOT NULL
    )
  `);
  const res = await client.execute('SELECT COUNT(*) as count FROM pricing');
  if (res.rows[0].count === 0) {
    await client.execute({
      sql: 'INSERT INTO pricing (basePrice, discountPercentage, lastUpdated) VALUES (?, ?, ?)',
      args: [199.00, 0.0, Date.now()],
    });
  }
  console.log('DB Initialized');
}
initDB().catch(console.error);

// ---- API ----

app.get('/', (req, res) => {
  res.send('OK');
});

// Fetch pricing
app.get('/api/pricing', async (req, res) => {
  try {
    const result = await client.execute('SELECT * FROM pricing LIMIT 1');
    if (!result.rows.length) return res.json({ success: false, message: "No pricing set" });
    const { basePrice, discountPercentage } = result.rows[0];
    const finalPrice = (basePrice * (1 - discountPercentage / 100)).toFixed(2);
    res.json({ success: true, data: {
      basePrice: basePrice.toFixed(2),
      discountPercentage: discountPercentage.toFixed(1),
      finalPrice
    }});
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Create Razorpay order
app.post('/api/razorpay/order', async (req, res) => {
  try {
    const { amount, currency } = req.body;
    if (!amount || !currency) return res.status(400).json({ success: false, message: 'Missing amount or currency' });
    const order = await razorpay.orders.create({
      amount: parseInt(amount), // paise
      currency,
      receipt: 'receipt_' + Date.now(),
    });
    return res.json({ success: true, orderId: order.id });
  } catch (e) {
    console.error('Razorpay order error', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// Save payment details
app.post('/api/enroll', (req, res) => {
    const { name, phone, email, razorpay_payment_id } = req.body;

    if (!name || !phone || !email || !razorpay_payment_id) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // TODO: In production, verify payment with Razorpay API here

    // Simulate DB insert / enrollment
    // For demo, always succeed
    return res.json({ success: true, message: "Enrolled successfully!" });
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
