// ============================================================
// VastMyWealth – Render Relay Server v4
// Updated : March 2026
//
// FLOW:
// Customer messages WhatsApp → store message →
// Check if template already sent →
// If not sent → send "welcome" template (same for all loan types)
// ============================================================

const express = require("express");
const fetch   = require("node-fetch");
const app     = express();

app.use(express.json());

// ============================================================
// ENVIRONMENT VARIABLES — Set in Render dashboard
// VERIFY_TOKEN     — your webhook verify token
// WHATSAPP_TOKEN   — Meta permanent access token
// PHONE_NUMBER_ID  — Meta phone number ID
// APPS_SCRIPT_URL  — your deployed Apps Script URL
// ============================================================

// ============================================================
// ONE TEMPLATE FOR ALL — welcome template
// ============================================================
const WELCOME_TEMPLATE = "welcome";

// ============================================================
// DETECT LOAN TYPE — Fuzzy matching (for storage only)
// ============================================================
function detectLoanType(text) {
  if (!text) return "Personal Loan";
  const t = text.toUpperCase().trim();
  if (t.includes("HOME")     || t === "HL"  || t.includes("#HL"))  return "Home Loan";
  if (t.includes("BUSINESS") || t === "BL"  || t.includes("#BL"))  return "Business Loan";
  if (t.includes("PROPERTY") || t === "LAP" || t.includes("#LAP") ||
      t.includes("AGAINST")  || t.includes("MORTG"))               return "Loan Against Property";
  if (t.includes("PERSONAL") || t === "PL"  || t.includes("#PL"))  return "Personal Loan";
  if (t.includes("PARTNER")  || t.includes("EARN") || 
      t.includes("JOIN")     || t.includes("AGENT")) return "Partner Inquiry";
  return "Personal Loan";
}
// ============================================================
// CHECK IF TEMPLATE ALREADY SENT
// ============================================================
async function isTemplateAlreadySent(mobile) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return false;
    const url  = process.env.APPS_SCRIPT_URL + "?mobile=" + encodeURIComponent(mobile);
    const res  = await fetch(url);
    const data = await res.json();
    console.log(`🔍 Template check for ${mobile}: filled=${data.filled}`);
    return data.filled === true;
  } catch (err) {
    console.error("❌ isTemplateAlreadySent error:", err.message);
    return false;
  }
}

// ============================================================
// CHECK IF ALREADY IN WA LEADS
// ============================================================
async function isAlreadyInWALeads(mobile) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return false;
    const url  = process.env.APPS_SCRIPT_URL +
      "?action=checkWALead&mobile=" + encodeURIComponent(mobile);
    const res  = await fetch(url);
    const data = await res.json();
    return data.exists === true;
  } catch (err) {
    console.error("❌ isAlreadyInWALeads error:", err.message);
    return false;
  }
}

// ============================================================
// SEND WHATSAPP TEMPLATE
// ============================================================
async function sendTemplate(to, templateName) {
  try {
    const url = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to               : to,
      type             : "template",
      template         : {
        name      : templateName,
        language  : { code: "en" },
        components: []
      }
    };

    const res  = await fetch(url, {
      method : "POST",
      headers: {
        "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type" : "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.messages) {
      console.log(`✅ Template sent: ${templateName} → ${to}`);
      return true;
    } else {
      console.error("❌ Template failed:", JSON.stringify(data));
      return false;
    }

  } catch (err) {
    console.error("❌ sendTemplate error:", err.message);
    return false;
  }
}

// ============================================================
// STORE IN APPS SCRIPT — Via GET
// ============================================================
async function storeInAppsScript(mobile, message) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return;
    const url = process.env.APPS_SCRIPT_URL +
      "?action=storeMessage" +
      "&mobile=" + encodeURIComponent(mobile) +
      "&message=" + encodeURIComponent(message || "");
    const res  = await fetch(url);
    const data = await res.json();
    if (data.success) {
      console.log("✅ Stored in Apps Script:", mobile);
    } else {
      console.error("❌ Store failed:", JSON.stringify(data));
    }
  } catch (err) {
    console.error("❌ storeInAppsScript error:", err.message);
  }
}

// ============================================================
// 1. WEBHOOK VERIFICATION
// ============================================================
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  if (
    req.query["hub.mode"]         === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verified!");
    return res.send(req.query["hub.challenge"]);
  }
  console.error("❌ Webhook verification failed!");
  res.sendStatus(403);
});
// ============================================================
// SEND TEMPLATE WITH IMAGE HEADER
// ============================================================
async function sendTemplateWithImage(to, templateName, imageUrl) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUM_ID}/messages`,
      {
        method : "POST",
        headers: {
          "Content-Type" : "application/json",
          "Authorization": `Bearer ${META_TOKEN}`
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to               : to,
          type             : "template",
          template         : {
            name      : templateName,
            language  : {code: "en"},
            components: [
              {
                type      : "header",
                parameters: [{type:"image", image:{link: imageUrl}}]
              }
            ]
          }
        })
      }
    );
    const result = await response.json();
    if (result.messages) {
      console.log(`✅ Template sent: ${templateName} → ${to}`);
      return true;
    }
    console.log(`❌ Template failed: ${JSON.stringify(result)}`);
    return false;
  } catch(e) {
    console.error("sendTemplateWithImage error:", e.message);
    return false;
  }
}



// ============================================================
// 2. RECEIVE INCOMING WHATSAPP MESSAGE
// ============================================================

app.post("/webhook", async (req, res) => {

  // Always respond 200 IMMEDIATELY — Meta requires this!
  res.sendStatus(200);

  try {
    const entry   = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Ignore status updates
    if (value?.statuses) {
      console.log("📊 Status update — ignored");
      return;
    }

    const message = value?.messages?.[0];
    if (!message) return;

    // Only handle text messages
    if (message.type !== "text") {
      console.log("⚠️ Non-text message — ignored:", message.type);
      return;
    }

    const from = message.from;
    const text = message.text?.body || "";

    console.log(`📩 Incoming from ${from}: "${text}"`);

    // ── STEP 1: Store message ─────────────────────────────
    await storeInAppsScript(from, text);

    // ── STEP 2: Check if template already sent ────────────
    const alreadySent = await isTemplateAlreadySent(from);

if (alreadySent) {
  console.log(`⏭️ Template already sent — skipping: ${from}`);
  return;
}

    // ── STEP 3: Detect loan type (for logging only) ───────
    const loanType = detectLoanType(text);
    console.log(`💡 Loan type detected: ${loanType}`);

    
// ── STEP 4: Send loan specific template ──────
if (loanType === "Home Loan") {
  console.log(`📤 Sending welcome_hl → ${from}`);
  await sendTemplateWithImage(from, "welcome_hl", "https://drive.google.com/uc?export=download&id=151p69azxUf_tcJH9uwueGtigbyqMscFk");
} else if (loanType === "Loan Against Property") {
  console.log(`📤 Sending welcome_lap → ${from}`);
  await sendTemplateWithImage(from, "welcome_lap", "https://drive.google.com/uc?export=download&id=1WUkhuqRbtAm5hHk3dnZ8JLzYHz4E2AHq");
} else if (loanType === "Personal Loan" || loanType === "Business Loan") {
  console.log(`📤 Sending welcome_unsecured → ${from}`);
  await sendTemplateWithImage(from, "welcome_unsecured", "https://drive.google.com/uc?export=download&id=1llb-yxEyzSR1JVEqdM4TmI7_ICDOFSrD");
} else if (loanType === "Balance Transfer + Top Up") {
  console.log(`📤 Sending welcome_lap → ${from}`);
  await sendTemplateWithImage(from, "welcome_lap", "https://drive.google.com/uc?export=download&id=1WUkhuqRbtAm5hHk3dnZ8JLzYHz4E2AHq");
} else if (loanType === "Partner Inquiry") {
  console.log(`📤 Sending partner_recruitment → ${from}`);
  await sendTemplateWithImage(from, "partner_recruitment", "https://drive.google.com/uc?export=download&id=18WCgSkS9sLmeI8YNgaLPKbBw-QJ90xPv");
} else if (loanType === "Construction Finance") {
  console.log(`📤 Sending construction_finance → ${from}`);
  await sendTemplateWithImage(from, "construction_finance", "https://drive.google.com/uc?export=download&id=1la4AWXmwlpwqXWC9cZsvUnwxgyq92Bxz");
} else {
  console.log(`📤 Sending welcome → ${from}`);
  await sendTemplate(from, WELCOME_TEMPLATE);
}


  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// ============================================================
// 3. HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status : "✅ VastMyWealth Relay v4 Running",
    version: "v4",
    time   : new Date().toISOString()
  });
});

// ============================================================
// 4. START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 VastMyWealth Relay v4 running on port ${PORT}`);
});

