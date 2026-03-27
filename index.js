const express = require("express");
const fetch = require("node-fetch");


const app = express();
app.use(express.json());
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ✅ VERIFY WEBHOOK
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
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

    if (message) {
      const from = message.from;
      const text = message.text?.body;

      console.log(`Message from ${from}: ${text}`);

      // ✅ SEND TEMPLATE (GUARANTEED DELIVERY)
     await fetch(
  `https://graph.facebook.com/v18.0/${process.env.966242066580030}/messages`,
  {
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
        body: "Test message working"
      }
    })
  }
);


      console.log("Template sent");

      // ✅ STORE IN SHEET
      if (process.env.APPS_SCRIPT_URL) {
        await fetch(process.env.APPS_SCRIPT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mobile: from,
            message: text,
          }),
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(process.env.PORT || 10000, () => {
  console.log("Server running");
});
