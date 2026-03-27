const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// Webhook verification (Meta setup)
app.get("/webhook", (req, res) => {
  const verify_token = process.env.myverify123;

  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === verify_token
  ) {
    return res.send(req.query["hub.challenge"]);
  }

  res.sendStatus(403);
});

// Incoming messages
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;

    console.log("Message received from:", from);

    // 🔥 SIMPLE ACK MESSAGE
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
          text: {
            body: "✅ Request received. Our team will contact you shortly. Type FREE HELP anytime."
          }
        })
      }
    );

    console.log("Reply sent");

    res.sendStatus(200);
  } catch (error) {
    console.error("Error:", error);
    res.sendStatus(500);
  }
});

app.listen(process.env.PORT || 10000, () => {
  console.log("Server running");
});
