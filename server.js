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

// updated
app.use(cors({
  origin: 'https://jairisys.tech',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
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
  console.log('Order create request:', req.body);
  try {
    if (!amount || !currency || !receipt) {
      return res.status(400).json({ success: false, error: "Missing parameters" });
    }
    const order = await razorpay.orders.create({
      amount: parseInt(amount), // Ensure integer
      currency,
      receipt,
      payment_capture: 1
    });
    res.json({ success: true, order });
  } catch (err) {
    console.error('Razorpay error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get('/check_payment_status/:payment_id', async (req, res) => {
  const paymentId = req.params.payment_id;
  if (!paymentId) {
    return res.status(400).json({ success: false, error: "Missing payment_id in URL" });
  }
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    // payment.status can be 'created', 'authorized', 'captured', 'failed', 'refunded', etc.
    // For most app usage, 'captured' means success, 'failed' means failure, others are pending.
    let status = "pending";
    if (payment.status === "captured") status = "success";
    else if (payment.status === "failed") status = "failed";

    res.json({
      success: true,
      payment_id: paymentId,
      status: status,
      raw_status: payment.status,
      payment_details: payment
    });
  } catch (err) {
    console.error("Error fetching payment:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// Fetch user transactions from Razorpay
app.get('/api/user_transactions', async (req, res) => {
  const userEmail = req.query.email;
  if (!userEmail) {
    return res.status(400).json({ success: false, error: "Missing email parameter" });
  }
  try {
    // Fetch payments with notes.email matching userEmail
    const payments = await razorpay.payments.all({
      'notes.email': userEmail
    });
    const transactions = payments.items.map(payment => ({
      payment_id: payment.id,
      user_email: userEmail,
      amount: payment.amount / 100, // Convert paise to rupees
      status: payment.status === "captured" ? "success" :
              payment.status === "failed" ? "failed" :
              payment.status === "refunded" ? "refunded" : "pending",
      order_id: payment.order_id,
      created_at: payment.created_at
    }));
    res.json({
      success: true,
      data: transactions
    });
  } catch (e) {
    console.error("Error fetching transactions:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});



app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
