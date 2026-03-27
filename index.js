const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ✅ WEBHOOK VERIFICATION
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.myverify123;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ✅ RECEIVE MESSAGE
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body;

    console.log(`📩 Message from ${from}: ${text}`);

    // ✅ SAVE TO GOOGLE SHEET
    if (process.env.APPS_SCRIPT_URL) {
      await fetch(process.env.APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mobile: from,
          message: text,
          timestamp: new Date().toISOString()
        })
      });

      console.log("✅ Stored in Google Sheet");
    }

    // ✅ AUTO REPLY
    const replyText = `✅ *Request Received Successfully*

Thank you! We've noted your requirement.

👨‍💼 Our loan expert will connect with you shortly.

📞 Expect a call or WhatsApp update soon.

💬 Need urgent help? Type *FREE HELP* anytime.`;

    await fetch(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.EAANJuuOCZCvsBRLESBVoBdk55PvTJauJVwmtdkQmaE8pE2rM37ZBkd49kYm4m1e5IZBMU6WjpV9uLi8R6aPJH25KLkRXPXlyR5ZCYffCJguh9ksg2vMxlBHin2LP8hmIOMw2Rcum0goUUZBUuahmeOxZBBmF9764nIlzIG4blRe5b3m3ZBR2jRfmrkzDsLUuNISabRfqMzEC1EnsULTRMQAFIGtZBvds3ZA8lVoZCpfEPEsPcVeXjUeMsZAlsx4YD6d6ZC6fIn4a4NA153Ga6M7ZCCNPYbStb}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: from,
        type: "text",
        text: {
          body: replyText
        }
      })
    });

    console.log("✅ Reply sent");

    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error:", error);
    res.sendStatus(500);
  }
});

// ✅ START SERVER (VERY IMPORTANT)
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
