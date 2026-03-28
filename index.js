// ============================================================
// VastMyWealth – Render Relay Server v3
// Updated : March 2026
//
// FIXES:
// - Template only sent ONCE per customer (dedup check)
// - Correct template per loan type
// - Apps Script storage via GET
// - Immediate 200 response to Meta
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
// TEMPLATE MAP
// ============================================================
const TEMPLATES = {
  "Personal Loan"        : "welcome_unsecured",
  "Business Loan"        : "welcome_unsecured",
  "Home Loan"            : "welcome_hl",
  "Loan Against Property": "welcome_lap"
};

// ============================================================
// DETECT LOAN TYPE — Fuzzy matching
// ============================================================
function detectLoanType(text) {
  if (!text) return "Personal Loan";
  const t = text.toUpperCase().trim();

  if (t.includes("HOME")     || t === "HL"  || t.includes("#HL"))  return "Home Loan";
  if (t.includes("BUSINESS") || t === "BL"  || t.includes("#BL"))  return "Business Loan";
  if (t.includes("PROPERTY") || t === "LAP" || t.includes("#LAP") ||
      t.includes("AGAINST")  || t.includes("MORTG"))               return "Loan Against Property";
  if (t.includes("PERSONAL") || t === "PL"  || t.includes("#PL"))  return "Personal Loan";

  return "Personal Loan"; // default
}

// ============================================================
// CHECK IF TEMPLATE ALREADY SENT
// Calls Apps Script to check WA Leads tab
// Returns true if already sent — skip template
// ============================================================
async function isTemplateAlreadySent(mobile) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return false;

    const url      = process.env.APPS_SCRIPT_URL + "?mobile=" + encodeURIComponent(mobile);
    const res      = await fetch(url);
    const data     = await res.json();

    // If customer already in system (form filled or WA stored) = template sent before
    console.log(`🔍 Template check for ${mobile}: filled=${data.filled}`);
    return data.filled === true;

  } catch (err) {
    console.error("❌ isTemplateAlreadySent error:", err.message);
    return false; // If check fails — allow template (safe default)
  }
}

// ============================================================
// CHECK IF ALREADY IN WA LEADS
// Separate check specifically for WA Leads tab
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
async function sendTemplate(to, templateName, firstName) {
  try {
    const url = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;

    // Build components — digital_journey needs first name variable
    const components = [];
    if (templateName === "digital_journey" && firstName) {
      components.push({
        type      : "body",
        parameters: [{ type: "text", text: firstName }]
      });
    }

    const payload = {
      messaging_product: "whatsapp",
      to               : to,
      type             : "template",
      template         : {
        name      : templateName,
        language  : { code: "en" },
        components: components
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

    // Ignore status updates (delivered, read etc)
    if (value?.statuses) {
      console.log("📊 Status update received — ignored");
      return;
    }

    const message = value?.messages?.[0];
    if (!message) return;

    // Only handle text messages
    if (message.type !== "text") {
      console.log("⚠️ Non-text message — ignored:", message.type);
      return;
    }

    const from      = message.from;  // e.g. 919594592020
    const text      = message.text?.body || "";

    console.log(`📩 Incoming from ${from}: "${text}"`);

    // ── STEP 1: Always store message first ────────────────
    await storeInAppsScript(from, text);

    // ── STEP 2: Check if template already sent ────────────
    const alreadySent = await isTemplateAlreadySent(from);

    if (alreadySent) {
      console.log(`⏭️ Template already sent to ${from} — skipping`);
      return;
    }

    // ── STEP 3: Detect loan type ──────────────────────────
    const loanType     = detectLoanType(text);
    const templateName = TEMPLATES[loanType] || "digital_journey";

    // Get first name from message if possible (for digital_journey variable)
    // Default to empty — Apps Script will use name from form if available
    const firstName = "";

    console.log(`💡 Loan: ${loanType} → Template: ${templateName}`);

    // ── STEP 4: Send template ─────────────────────────────
    await sendTemplate(from, templateName, firstName);

  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// ============================================================
// 3. HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status : "✅ VastMyWealth Relay v3 Running",
    version: "v3",
    time   : new Date().toISOString()
  });
});

// ============================================================
// 4. START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 VastMyWealth Relay v3 running on port ${PORT}`);
});

