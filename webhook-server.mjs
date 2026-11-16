import express from 'express';
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/otp', (req, res) => {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('========================');
  res.json({ success: true });
});

app.listen(8080, () => {
  console.log('Webhook server listening on http://localhost:8080/otp');
});