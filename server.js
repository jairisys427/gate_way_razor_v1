const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Razorpay = require('razorpay');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// SQLite/Turso client
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

// Order creation
app.post('/create_order', async (req, res) => {
  const { amount, currency, receipt } = req.body;
  try {
    const order = await razorpay.orders.create({
      amount: amount, // in paise
      currency: currency,
      receipt: receipt,
      payment_capture: 1
    });
    res.json({ id: order.id, status: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
