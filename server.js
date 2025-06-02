const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Razorpay = require('razorpay');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Razorpay keys from .env or hardcoded for demo
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_Ds5xqQIv1RKQHb",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "YOUR_KEY_SECRET",
});

app.use(cors());
app.use(bodyParser.json());

// Dummy pricing (could be from DB)
let PRICING = { basePrice: 199.00, discountPercentage: 0 };

// Health check
app.get('/', (req, res) => res.send('OK'));

// Get pricing
app.get('/api/pricing', (req, res) => {
  const finalPrice = (PRICING.basePrice * (1 - PRICING.discountPercentage / 100)).toFixed(2);
  res.json({
    success: true,
    data: {
      basePrice: PRICING.basePrice.toFixed(2),
      discountPercentage: PRICING.discountPercentage,
      finalPrice,
    },
  });
});

// Razorpay order creation
app.post('/api/razorpay/order', async (req, res) => {
  try {
    const { amount, currency } = req.body;
    if (!amount || !currency) return res.status(400).json({ success: false, message: "Missing amount/currency." });

    const order = await razorpay.orders.create({
      amount: parseInt(amount), // paise
      currency,
      receipt: 'rcpt_' + Date.now(),
    });
    res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Order create failed.", error: err.message });
  }
});

// Payment log endpoint (for demo: always succeed)
app.post('/api/payment', (req, res) => {
  console.log('Payment save request:', req.body); // Inspect in your logs!
  // In production, save in DB here and validate the payment.
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
