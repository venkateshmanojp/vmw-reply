// ============================================================
// VastMyWealth – Render Relay Server v5
// Updated : April 2026
//
// FLOW:
// Customer messages WhatsApp → store message →
// Check if template already sent →
// If loan type known (icebreaker/keyword) → send template directly
// If loan type unknown → AI Bot qualifies → sends correct template
// After template sent → Bot stops
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
// ANTHROPIC_KEY    — Claude AI API key
// ============================================================

const WELCOME_TEMPLATE = "welcome";
const ANTHROPIC_URL    = "https://api.anthropic.com/v1/messages";

// In-memory conversation store
const conversations = {};

// ============================================================
// BOT SYSTEM PROMPT
// ============================================================
const BOT_SYSTEM_PROMPT = `You are "Chat Support" for VastMyWealth Advisory — a professional loan DSA aggregator in India.

YOUR IDENTITY:
- Name: Chat Support
- Company: VastMyWealth Advisory
- Greeting: "Hi! I am Your Chat Support. How can I help you? 😊"

YOUR KNOWLEDGE:

LOAN PRODUCTS:
- Personal Loan (PL): 10.5%-18% | Rs.50,000 to Rs.40 Lakhs | Within 24 hours*
- Home Loan (HL): 8.5%-10.5% | Rs.5 Lakhs to Rs.10+ Crores | Within 48 hours*
- Business Loan (BL): 12%-24% | Rs.1 Lakh to Rs.5+ Crores | Within 48 hours*
- Loan Against Property (LAP): 9%-13% | Rs.5 Lakhs to Rs.15+ Crores | Within 48 hours*
- Balance Transfer + Top Up: Available for HL and LAP
- Construction Finance: Available for builders and developers
*Subject to complete documentation and lender verification. Final decision by lender.

WHY VASTMYWEALTH:
- Multi-lender platform — find best lender for your profile
- Approval-first approach — highest approval chances
- Faster processing — pre-evaluated cases before login
- Expert handling — structured case to avoid rejection
- End-to-end support — from application to disbursal

CHANNEL PARTNER PROGRAM:
- No registration fee
- Commission paid post disbursement
- Anyone can join — real estate agents, freelancers, DSAs, financial advisors, builders
- Complete end-to-end support provided
- "You focus on sourcing — we handle the execution"

STRICT RULES — NEVER BREAK:
1. NEVER guarantee loan approval
2. NEVER promise exact interest rates — always say "rates depend on your profile"
3. NEVER promise timelines without saying "subject to complete documentation"
4. ALWAYS say "final decision by lender"
5. NEVER give false promises or hopes
6. If unsure — say "Our team will assist you with this"

LANGUAGE: Detect customer language and respond in same language. Use Hinglish if mixed.

YOUR GOAL:
1. Understand customer need (loan type, amount, purpose)
2. Answer queries honestly
3. Collect: Name, Loan Type, Amount, Employment Type, City
4. After identifying loan type OR 7 messages → set sendTemplate=true

WHEN FRUSTRATED: "I understand your concern. Our internal team will personally address your query within 24 hours."
WHEN WANTS HUMAN: "Sure! Please leave your message and our team will get back to you shortly."
WHEN UNKNOWN: "I'll connect you with our team for this. They will get back to you shortly!"

RESPONSE FORMAT — Always respond in this exact JSON:
{
  "message": "your response to customer",
  "loanType": "detected loan type or null",
  "customerName": "customer name if mentioned or null",
  "loanAmount": "loan amount if mentioned or null",
  "city": "city if mentioned or null",
  "employmentType": "Salaried or Self-Employed if mentioned or null",
  "sendTemplate": true or false,
  "templateType": "HL or LAP or PL or BL or BTTU or PARTNER or CF or null"
}

Set sendTemplate=true when:
1. Loan type clearly identified, OR
2. Customer says they want to apply, OR
3. 7 messages reached

templateType mapping:
- Home Loan → "HL"
- Loan Against Property → "LAP"
- Personal Loan → "PL"
- Business Loan → "BL"
- Balance Transfer/Top Up → "BTTU"
- Partner/Join/Earn → "PARTNER"
- Construction Finance → "CF"
- Unknown after 7 msgs → "PL"`;

// ============================================================
// DETECT LOAN TYPE FROM KEYWORD
// ============================================================
function detectLoanType(text) {
  if (!text) return null;
  const t = text.toUpperCase().trim();
  if (t.includes("HOME")        || t === "HL"  || t.includes("#HL"))  return "Home Loan";
  if (t.includes("BUSINESS")    || t === "BL"  || t.includes("#BL"))  return "Business Loan";
  if (t.includes("PROPERTY")    || t === "LAP" || t.includes("#LAP") ||
      t.includes("AGAINST")     || t.includes("MORTG"))               return "Loan Against Property";
  if (t.includes("PERSONAL")    || t === "PL"  || t.includes("#PL"))  return "Personal Loan";
  if (t.includes("PARTNER")     || t.includes("EARN") ||
      t.includes("JOIN")        || t.includes("AGENT"))               return "Partner Inquiry";
  if (t.includes("CONSTRUCTION")|| t.includes("BUILDER"))             return "Construction Finance";
  if (t.includes("BALANCE")     || t.includes("TRANSFER") ||
      t.includes("TOP UP")      || t.includes("TOPUP"))               return "Balance Transfer + Top Up";
  return null; // Unknown — bot handles
}

// ============================================================
// SEND CORRECT TEMPLATE BASED ON LOAN TYPE
// ============================================================
async function sendLoanTemplate(to, loanType) {
  const lt = (loanType || "").toUpperCase();
  if (lt.includes("HOME") || lt === "HL") {
    return await sendTemplateWithImage(to, "welcome_hl",
      "https://drive.google.com/uc?export=download&id=151p69azxUf_tcJH9uwueGtigbyqMscFk");
  } else if (lt.includes("LAP") || lt.includes("PROPERTY") || lt === "BTTU" || lt.includes("BALANCE") || lt.includes("TRANSFER") || lt.includes("TOP")) {
    return await sendTemplateWithImage(to, "welcome_lap",
      "https://drive.google.com/uc?export=download&id=1WUkhuqRbtAm5hHk3dnZ8JLzYHz4E2AHq");
  } else if (lt.includes("PERSONAL") || lt === "PL" || lt.includes("BUSINESS") || lt === "BL") {
    return await sendTemplateWithImage(to, "welcome_unsecured",
      "https://drive.google.com/uc?export=download&id=1llb-yxEyzSR1JVEqdM4TmI7_ICDOFSrD");
  } else if (lt.includes("PARTNER") || lt.includes("JOIN") || lt.includes("EARN")) {
    return await sendTemplateWithImage(to, "partner_recruitment",
      "https://drive.google.com/uc?export=download&id=18WCgSkS9sLmeI8YNgaLPKbBw-QJ90xPv");
  } else if (lt.includes("CONSTRUCTION") || lt.includes("BUILDER") || lt === "CF") {
    return await sendTemplateWithImage(to, "construction_finance",
      "https://drive.google.com/uc?export=download&id=1la4AWXmwlpwqXWC9cZsvUnwxgyq92Bxz");
  } else {
    return await sendTemplate(to, WELCOME_TEMPLATE);
  }
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
// STORE IN APPS SCRIPT
// ============================================================
async function storeInAppsScript(mobile, message) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return;
    const url = process.env.APPS_SCRIPT_URL +
      "?action=storeMessage" +
      "&mobile="  + encodeURIComponent(mobile) +
      "&message=" + encodeURIComponent(message || "");
    const res  = await fetch(url);
    const data = await res.json();
    if (data.success) console.log("✅ Stored in Apps Script:", mobile);
  } catch (err) {
    console.error("❌ storeInAppsScript error:", err.message);
  }
}

// ============================================================
// SEND TEXT MESSAGE
// ============================================================
async function sendTextMessage(to, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method : "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type" : "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to               : to,
          type             : "text",
          text             : {body: text}
        })
      }
    );
    const data = await res.json();
    return data.messages ? true : false;
  } catch(e) {
    console.error("sendTextMessage error:", e.message);
    return false;
  }
}

// ============================================================
// SEND TEMPLATE (no image)
// ============================================================
async function sendTemplate(to, templateName) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method : "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type" : "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to               : to,
          type             : "template",
          template         : {name: templateName, language: {code: "en"}, components: []}
        })
      }
    );
    const data = await res.json();
    if (data.messages) { console.log(`✅ Template sent: ${templateName} → ${to}`); return true; }
    console.error("❌ Template failed:", JSON.stringify(data));
    return false;
  } catch (err) {
    console.error("❌ sendTemplate error:", err.message);
    return false;
  }
}

// ============================================================
// SEND TEMPLATE WITH IMAGE
// ============================================================
async function sendTemplateWithImage(to, templateName, imageUrl) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        method : "POST",
        headers: {
          "Content-Type" : "application/json",
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to               : to,
          type             : "template",
          template         : {
            name      : templateName,
            language  : {code: "en"},
            components: [{type:"header", parameters:[{type:"image", image:{link: imageUrl}}]}]
          }
        })
      }
    );
    const result = await res.json();
    if (result.messages) { console.log(`✅ Template sent: ${templateName} → ${to}`); return true; }
    console.log(`❌ Template failed: ${JSON.stringify(result)}`);
    return false;
  } catch(e) {
    console.error("sendTemplateWithImage error:", e.message);
    return false;
  }
}

// ============================================================
// CALL CLAUDE AI BOT
// ============================================================
async function callClaudeBot(mobile, userMessage, history, isReturning, prevContext) {
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
    if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_KEY not set!"); return null; }

    const messages = [];

    // Add returning customer context
    if (isReturning && prevContext) {
      messages.push({role:"user", content:`[SYSTEM: Returning customer. Previous context: ${prevContext}. Greet warmly.]`});
      messages.push({role:"assistant", content:`{"message":"Welcome back! I remember you were asking about ${prevContext}. How can I help you today? 😊","loanType":null,"customerName":null,"loanAmount":null,"city":null,"employmentType":null,"sendTemplate":false,"templateType":null}`});
    }

    // Add history
    history.forEach(msg => messages.push({role: msg.role, content: msg.content}));

    // Add current message
    messages.push({role:"user", content: userMessage});

    const res = await fetch(ANTHROPIC_URL, {
      method : "POST",
      headers: {
        "Content-Type"     : "application/json",
        "x-api-key"        : ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model     : "claude-haiku-4-5",
        max_tokens: 500,
        system    : BOT_SYSTEM_PROMPT,
        messages  : messages
      })
    });

    const data = await res.json();
    if (data.content && data.content[0]) {
      const text = data.content[0].text;
      try {
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  // Clean bold markdown for WhatsApp
  parsed.message = parsed.message
    .replace(/\*\*/g, "*")
    .replace(/#{1,6}\s/g, "");
  return parsed;
} catch(e) {
  // Extract message before JSON if present
  const msgMatch = text.match(/"message"\s*:\s*"([^"]+)"/);
  const cleanMsg = msgMatch ? msgMatch[1] : text.split('{')[0].trim();
  return {message: cleanMsg, loanType: null, sendTemplate: false, templateType: null};
}
    }
    return null;
  } catch(e) {
    console.error("callClaudeBot error:", e.message);
    return null;
  }
}

// ============================================================
// SAVE CONVERSATION TO APPS SCRIPT
// ============================================================
async function saveConversation(mobile, role, message) {
  try {
    const url = process.env.APPS_SCRIPT_URL +
      "?action=saveConversation" +
      "&mobile="  + encodeURIComponent(mobile) +
      "&role="    + encodeURIComponent(role) +
      "&message=" + encodeURIComponent(message.substring(0, 500));
    await fetch(url);
  } catch(e) {}
}

// ============================================================
// GET CONVERSATION HISTORY FROM APPS SCRIPT
// ============================================================
async function getConversationHistory(mobile) {
  try {
    const url  = process.env.APPS_SCRIPT_URL +
      "?action=getConversation&mobile=" + encodeURIComponent(mobile);
    const res  = await fetch(url);
    const data = await res.json();
    return data.conversation || [];
  } catch(e) { return []; }
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

  res.sendStatus(200);

  try {
    const entry   = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (value?.statuses) return;

    const message = value?.messages?.[0];
    if (!message) return;

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
      console.log(`⏭️ Template already sent — bot inactive: ${from}`);
      return;
    }

    // ── STEP 3: Detect loan type from keyword ─────────────
    const detectedLoanType = detectLoanType(text);
    console.log(`💡 Loan type detected: ${detectedLoanType || "Unknown — AI bot activating"}`);

    // ── STEP 4: Known keyword → send template directly ────
    if (detectedLoanType) {
      console.log(`📤 Keyword match — sending template directly → ${from}`);
      await sendLoanTemplate(from, detectedLoanType);
      delete conversations[from];
      return;
    }

    // ── STEP 5: Unknown → AI Bot handles ──────────────────
    console.log(`🤖 AI Bot activating for ${from}`);

    // Initialize conversation
    if (!conversations[from]) {
      conversations[from] = {
        messages    : [],
        msgCount    : 0,
        loanType    : null,
        name        : null,
        isReturning : false,
        prevContext : null
      };

      // Check returning customer
      const history = await getConversationHistory(from);
      if (history.length > 0) {
        conversations[from].isReturning = true;
        const lastMsgs = history.slice(-4);
        conversations[from].prevContext  = lastMsgs.map(m => `${m.role}: ${m.message}`).join(", ");
        conversations[from].messages     = lastMsgs.map(m => ({
          role   : m.role === "bot" ? "assistant" : "user",
          content: m.message
        }));
        console.log(`👋 Returning customer: ${from}`);
      }
    }

    const conv = conversations[from];
    conv.msgCount++;

    // Call Claude AI
    const botResponse = await callClaudeBot(
      from,
      text,
      conv.messages,
      conv.isReturning && conv.msgCount === 1,
      conv.prevContext
    );

    if (!botResponse) {
      // Fallback if AI fails
      await sendTextMessage(from,
        "Hi! I am Your Chat Support. How can I help you? 😊\n\n" +
        "Looking for:\n🏠 Home Loan\n💼 Personal Loan\n🏢 Business Loan\n🏗️ LAP\n🤝 Become Partner?"
      );
      return;
    }

    // Update history
    conv.messages.push({role:"user",      content: text});
    conv.messages.push({role:"assistant", content: JSON.stringify(botResponse)});
    if (conv.messages.length > 10) conv.messages = conv.messages.slice(-10);

    // Store collected info
    if (botResponse.customerName) conv.name     = botResponse.customerName;
    if (botResponse.loanType)     conv.loanType = botResponse.loanType;

    // Save conversation
    await saveConversation(from, "customer", text);
    await saveConversation(from, "bot",      botResponse.message);

    // Send reply
    await sendTextMessage(from, botResponse.message);

    // Send template if bot decided
    if (botResponse.sendTemplate && botResponse.templateType) {
      console.log(`🤖 Bot sending template: ${botResponse.templateType} → ${from}`);
      await new Promise(r => setTimeout(r, 1000));
      await sendLoanTemplate(from, botResponse.templateType);
      delete conversations[from];
      return;
    }

    // Force after 7 messages
    if (conv.msgCount >= 7) {
      console.log(`⏰ 7 messages — forcing template for ${from}`);
      const forcedType = conv.loanType || "Personal Loan";
      await sendTextMessage(from,
        "😊 Based on our conversation, here are your next steps to proceed!"
      );
      await new Promise(r => setTimeout(r, 1000));
      await sendLoanTemplate(from, forcedType);
      delete conversations[from];
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
    status : "✅ VastMyWealth Relay v5 Running",
    version: "v5",
    time   : new Date().toISOString()
  });
});

// ============================================================
// 4. START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 VastMyWealth Relay v5 running on port ${PORT}`);
});

