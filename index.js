const express = require('express');
const fetch   = require('node-fetch');
const app     = express();

app.use(express.json());

// ── CONFIG ────────────────────────────────────────────────
const VERIFY_TOKEN      = "Venky@1234";
const APPS_SCRIPT_URL   = "https://script.google.com/macros/s/AKfycbytDsEm2Z1_JD1Gpn-faYSdF1lVMIXxotMQ3qcB4P_7QIZC3juK8PZuhSTinkdlhASdEA/exec";

// ── META WEBHOOK VERIFICATION ─────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('Verification request:', { mode, token });

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Verification failed!');
    res.sendStatus(403);
  }
});

// ── INCOMING WHATSAPP MESSAGES ────────────────────────────
app.post('/webhook', (req, res) => {
  try {
    const body = req.body;

    if (body.entry) {
      const entry   = body.entry[0];
      const changes = entry?.changes?.[0];
      const value   = changes?.value;
      const messages= value?.messages;

      if (messages && messages.length > 0) {
        const msg    = messages[0];
        const mobile = msg.from || '';
        const text   = msg.text?.body || '';

        console.log('📱 Message from:', mobile, '→', text);

        // Forward to Apps Script
        if (mobile && text) {
          const url = APPS_SCRIPT_URL +
            '?action=storeMessage' +
            '&mobile=' + encodeURIComponent(mobile) +
            '&message=' + encodeURIComponent(text);

          fetch(url)
            .then(r => r.json())
            .then(d => console.log('✅ Stored:', d))
            .catch(e => console.log('❌ Store error:', e));
        }
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(200); // Always return 200 to Meta!
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status  : 'VMW Webhook Relay Running! ✅',
    version : '1.0'
  });
});

// ── START SERVER ──────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ VMW Relay running on port ${PORT}`);
});
