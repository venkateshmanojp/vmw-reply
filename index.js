const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// ENV VARIABLES
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_TOKEN = process.env.META_TOKEN;

// =======================
// WEBHOOK VERIFICATION
// =======================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// =======================
// RECEIVE MESSAGES
// =======================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object) {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const message = changes?.value?.messages?.[0];

     
  // 🔥 STEP 1: TEMPLATE LOGIC
  let templateName = "";
  const msg = text?.toLowerCase() || "";

  if (msg.includes("home loan") || msg.includes("hl")) {
    templateName = "welcome_hl";
  } 
  else if (msg.includes("loan against property") || msg.includes("lap")) {
    templateName = "welcome_lap";
  } 
  else if (msg.includes("personal loan") || msg.includes("business loan")) {
    templateName = "welcome_unsecured";
  } 
  else {
    templateName = "welcome_hi";
  }


  // 🔥 STEP 1: TEMPLATE LOGIC
  let templateName = "";
  const msg = text.toLowerCase();

  if (msg.includes("home loan") || msg.includes("hl")) {
    templateName = "welcome_hl";
  }
  else if (msg.includes("loan against property") || msg.includes("lap")) {
    templateName = "welcome_lap";
  }
  else if (
    msg.includes("personal loan") ||
    msg.includes("business loan") ||
    msg.includes("pl") ||
    msg.includes("bl")
  ) {
    templateName = "welcome_unsecured";
  }
  else if (msg.includes("loan")) {
    templateName = "form_reminder";
  }
  else {
    templateName = "welcome_hi";
  }

       console.log(`Message from: ${from} → ${text}`);

// SEND TO APPS SCRIPT
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


// ✅ ONLY ONE DECLARATION
let replyMessage = "";

if (keyword === "LOAN") {
  replyMessage = "Great! Please share your loan requirement.\n\nType:\n1. Personal Loan\n2. Business Loan\n3. Loan Against Property";
} else {
  replyMessage = "Welcome to VastMyWealth 😊\nType LOAN to get started.";
}

const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: from,
    type: "template",
    template: {
      name: templateName,   // 👈 dynamic (welcome_hl, welcome_lap, etc.)
      language: {
        code: "en"
      }
    }
  })
});


const result = await response.json();
console.log("WHATSAPP RESPONSE:", result);
// 🔥 STEP 3 ENDS HERE
 await fetch(`https://graph.facebook.com/v18.0/966242066580030/messages`, {
  method: "POST",
  headers: {
    "Authorization": `EAANJuuOCZCvsBRPDXhmqRKZCmL4yFoiMZCoWRKDLg6ZCCz2mwMZCv6TBPzkfrbKli9BEHEY75XqIRM3QizWncmIPzqlCuBd2tiXpZB1tgA0tQLT5xDy0bbZC3rMKmSErKL0mj42hGnDfChJqMcebCDOPntgXMCkjX3jCUYJ73ClI6WOv3ej8dlVOGF4ZCCQWMyZAi3AZDZD`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: from,
    text: { body: replyMessage }
  })
});

      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error:", error);
    res.sendStatus(500);
  }
});

// =======================
// SERVER START
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});
