const express = require('express');
const fetch   = require('node-fetch');
const app     = express();

app.use(express.json());

const VERIFY_TOKEN    = "Venky@1234";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbytDsEm2Z1_JD1Gpn-faYSdF1lVMIXxotMQ3qcB4P_7QIZC3juK8PZuhSTinkdlhASdEA/exec";

app.get('/webhook', (req, res) => {
  console.log('GET /webhook:', req.query);
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Verified!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Failed!');
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  console.log('📨 POST /webhook received!');
  console.log('Body:', JSON.stringify(req.body));
  try {
    const body = req.body;
    if (body.entry) {
      const msg = body.entry[0]?.changes?.[0]?.value?.messages?.[0];
      if (msg) {
        const mobile = msg.from || '';
        const text   = msg.text?.body || '';
        console.log('📱 From:', mobile, '→', text);
        if (mobile && text) {
          const url = APPS_SCRIPT_URL +
            '?action=storeMessage' +
            '&mobile=' + encodeURIComponent(mobile) +
            '&message=' + encodeURIComponent(text);
          fetch(url)
            .then(r => r.json())
            .then(d => console.log('✅ Stored:', d))
            .catch(e => console.log('❌ Error:', e.message));
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Error:', err.message);
    res.sendStatus(200);
  }
});

app.get('/', (req, res) => {
  res.json({status: 'VMW Relay Running ✅', version: '1.0'});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(✅ Running on port ${PORT}));
