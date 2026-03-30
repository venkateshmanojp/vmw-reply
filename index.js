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

    // ── STEP 4: Send welcome template (same for all) ──────
    console.log(`📤 Sending template: ${WELCOME_TEMPLATE} → ${from}`);
    await sendTemplate(from, WELCOME_TEMPLATE);

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

