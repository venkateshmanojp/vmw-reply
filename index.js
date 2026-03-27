import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ✅ WEBHOOK VERIFICATION (Meta setup)
app.get("/webhook", (req, res) => {
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

// ✅ MAIN WEBHOOK (Incoming messages)
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message) {
      const from = message.from;
      const text = message.text?.body;

      console.log(`📩 Message from ${from}: ${text}`);

      // ✅ GREETING MESSAGE (FINAL)
      const replyText = `✅ Request Received Successfully

Thank you! We’ve recorded your requirement.

👨‍💼 Our loan expert will connect with you shortly.

📞 Expect a call or WhatsApp update soon.

💬 Need faster help? Type FREE HELP anytime.`;

      // ✅ SEND MESSAGE TO WHATSAPP
      await fetch(
        `https://graph.facebook.com/v18.0/${process.env.966242066580030}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.EAANJuuOCZCvsBRLESBVoBdk55PvTJauJVwmtdkQmaE8pE2rM37ZBkd49kYm4m1e5IZBMU6WjpV9uLi8R6aPJH25KLkRXPXlyR5ZCYffCJguh9ksg2vMxlBHin2LP8hmIOMw2Rcum0goUUZBUuahmeOxZBBmF9764nIlzIG4blRe5b3m3ZBR2jRfmrkzDsLUuNISabRfqMzEC1EnsULTRMQAFIGtZBvds3ZA8lVoZCpfEPEsPcVeXjUeMsZAlsx4YD6d6ZC6fIn4a4NA153Ga6M7ZCCNPYbStb}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: {
              body: replyText,
            },
          }),
        }
      );

      console.log("✅ Reply sent");

      // ✅ STORE IN GOOGLE SHEET (Optional)
      if (process.env.APPS_SCRIPT_URL) {
        await fetch(process.env.https://script.google.com/macros/s/AKfycbytDsEm2Z1_JD1Gpn-faYSdF1lVMIXxotMQ3qcB4P_7QIZC3juK8PZuhSTinkdlhASdEA/exec, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mobile: from,
            message: text,
          }),
        });

        console.log("📄 Stored in Google Sheet");
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error:", error);
    res.sendStatus(500);
  }
});

// ✅ START SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
