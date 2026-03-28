// ============================================================
// VastMyWealth – Render Relay Server v2
// Fixes: Template sending, loan detection, Apps Script GET
// ============================================================

const express = require("express");
const fetch   = require("node-fetch");
const app     = express();

app.use(express.json());

// ============================================================
// ENVIRONMENT VARIABLES (set in Render dashboard)
// VERIFY_TOKEN     — myverify123
// WHATSAPP_TOKEN   — EAANJuuOCZCvsBRGPgTiqruItvYK1hLjgvEXm0RErZBUSVZCJ2k658TieW3znqp4UC1kOzZCQAhTCVG9BZBodZAPQTZBymOd3BfQrSE1z3o4vUCMfn23ce80gsipYr5ePbTdUpmdBVtCSBB1o90GuHVZAQPbosz5VCLDQ5t5OJeDKY0ZCkZAA5fuNaR61Tzr34giDp2WwZDZD
// PHONE_NUMBER_ID  — 966242066580030
// APPS_SCRIPT_URL  — https://script.google.com/macros/s/AKfycbytDsEm2Z1_JD1Gpn-faYSdF1lVMIXxotMQ3qcB4P_7QIZC3juK8PZuhSTinkdlhASdEA/exec
// ============================================================

// ============================================================
// TEMPLATE MAP — matches your approved Meta templates
// ============================================================
const TEMPLATES = {
  "Personal Loan"        : "welcome_unsecured",
  "Business Loan"        : "welcome_unsecured",
  "Home Loan"            : "welcome_hl",
  "Loan Against Property": "welcome_lap"
};

// ============================================================
// DETECT LOAN TYPE FROM MESSAGE
// ============================================================
function detectLoanType(text) {
  if (!text) return "Personal Loan";
  const t = text.toUpperCase();
  if (t.includes("HOME")     || t.includes("#HL"))  return "Home Loan";
  if (t.includes("BUSINESS") || t.includes("#BL"))  return "Business Loan";
  if (t.includes("PROPERTY") || t.includes("#LAP") || t.includes("LAP")) return "Loan Against Property";
  if (t.includes("PERSONAL") || t.includes("#PL"))  return "Personal Loan";
  return "Personal Loan"; // default
}

// ============================================================
// SEND WHATSAPP TEMPLATE — approved templates only
// ============================================================
async function sendTemplate(to, templateName) {
  try {
    const url = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to               : to,
      type             : "template",
      template         : {
        name    : templateName,
        language: { code: "en" }
      }
    };

    const res  = await fetch(url, {
      method : "POST",
      headers: {
        "Authorization" : `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type"  : "application/json"
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
// STORE IN APPS SCRIPT — via GET request
// ============================================================
async function storeInAppsScript(mobile, message) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return;

    const url = process.env.APPS_SCRIPT_URL
      + "?action=storeMessage"
      + "&mobile=" + encodeURIComponent(mobile)
      + "&message=" + encodeURIComponent(message || "");

    const res = await fetch(url, { method: "GET" });
    const data = await res.json();

    if (data.success) {
      console.log("✅ Stored in Apps Script:", mobile);
    } else {
      console.error("❌ Apps Script store failed:", JSON.stringify(data));
    }

  } catch (err) {
    console.error("❌ storeInAppsScript error:", err.message);
  }
}

// ============================================================
// 1. WEBHOOK VERIFICATION — Meta setup
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

  // Always respond 200 immediately — Meta requires this!
  res.sendStatus(200);

  try {
    const entry   = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Ignore status updates (delivered, read etc)
    if (value?.statuses) return;

    const message = value?.messages?.[0];
    if (!message) return;

    // Only handle text messages
    if (message.type !== "text") {
      console.log("⚠️ Non-text message received — ignored");
      return;
    }

    const from = message.from;           // customer mobile e.g. 919594592020
    const text = message.text?.body || "";

    console.log(`📩 Incoming from ${from}: ${text}`);

    // ── STEP 1: Detect loan type ──────────────────────────
    const loanType    = detectLoanType(text);
    const templateName= TEMPLATES[loanType] || "welcome_unsecured";

    console.log(`💡 Detected: ${loanType} → Template: ${templateName}`);

    // ── STEP 2: Send welcome template ─────────────────────
    await sendTemplate(from, templateName);

    // ── STEP 3: Store in Apps Script ──────────────────────
    await storeInAppsScript(from, text);

  } catch (err) {
    console.error("❌ Webhook error:", err.message);
  }
});

// ============================================================
// 3. HEALTH CHECK
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status : "✅ VastMyWealth Relay Running",
    version: "v2"
  });
});

// ============================================================
// 4. START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 VastMyWealth Relay running on port ${PORT}`);
});
