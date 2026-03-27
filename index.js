import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ✅ VERIFY WEBHOOK
app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verify_token) {
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

    // 🚨 STOP DUPLICATES + NON-TEXT EVENTS
    if (!message || message.type !== "text") {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "";

    console.log("Incoming message:", text);

    // ✅ ACKNOWLEDGEMENT MESSAGE ONLY
    const replyText =
      "✅ *Request Received Successfully*\n\n" +
      "Thank you! We’ve received your loan enquiry.\n\n" +
      "👨‍💼 Our loan expert will connect with you shortly to understand your requirement and suggest the best available options.\n\n" +
      "📞 Expect a quick response via call or WhatsApp.\n\n" +
      "💬 Need faster assistance? Type *FREE HELP* anytime.";

    // ✅ SEND MESSAGE
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
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
            body: replyText
          }
        })
      }
    );

    const data = await response.json();
    console.log("WhatsApp response:", data);

    // ✅ STORE IN GOOGLE SHEET (OPTIONAL)
    if (process.env.https://script.google.com/macros/s/AKfycbytDsEm2Z1_JD1Gpn-faYSdF1lVMIXxotMQ3qcB4P_7QIZC3juK8PZuhSTinkdlhASdEA/exec) {
      await fetch(process.env.APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mobile: from,
          message: text
        })
      });

      console.log("Stored in sheet");
    }

    return res.sendStatus(200);

  } catch (error) {
    console.error("ERROR:", error);
    return res.sendStatus(500);
  }
});

// ✅ START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
