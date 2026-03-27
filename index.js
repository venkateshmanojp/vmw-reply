import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// VERIFY WEBHOOK
app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verify_token) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// RECEIVE MESSAGE
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    // ✅ STOP DUPLICATES / NON-TEXT EVENTS
    if (!message || message.type !== "text") {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "";

    console.log("Incoming:", text);

    // 🔥 STEP 1: TEMPLATE LOGIC
    let templateName = "";
    const msg = text.toLowerCase();

    if (msg.includes("home loan") || msg.includes("hl")) {
      templateName = "welcome_hl";
    } 
    else if (msg.includes("loan against property") || msg.includes("lap")) {
      templateName = "welcome_lap";
    } 
    else if (msg.includes("personal loan") || msg.includes("business loan") || msg.includes("loan")) {
      templateName = "welcome_unsecured";
    } 
    else {
      templateName = "welcome_hi";
    }

    console.log("TEMPLATE:", templateName);

    // 🔥 STEP 2: SEND TEMPLATE MESSAGE
    const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: from,
    type: "text",
    text: {
      body:
        "✅ *Request Received Successfully*\n\n" +
        "Thank you! We’ve received your loan enquiry.\n\n" +
        "👨‍💼 Our loan expert will connect with you shortly to understand your requirement and suggest the best available options.\n\n" +
        "📞 Expect a quick response via call or WhatsApp.\n\n" +
        "💬 Need faster assistance? Type *FREE HELP* anytime."
    }
  })
});


    const data = await response.json();
    console.log("WHATSAPP RESPONSE:", data);

    // 🔥 STEP 3: SEND TO GOOGLE SHEET (OPTIONAL)
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

    console.log("Stored successfully");

    res.sendStatus(200);

  } catch (error) {
    console.error("ERROR:", error);
    res.sendStatus(500);
  }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
