// ============================================================
// VastMyWealth - Render Relay Server v5
// Updated : April 2026
// ============================================================

const express = require("express");
const fetch   = require("node-fetch");
const app     = express();

app.use(express.json());

const WELCOME_TEMPLATE = "welcome";
const ANTHROPIC_URL    = "https://api.anthropic.com/v1/messages";
const conversations    = {};

// ============================================================
// BOT SYSTEM PROMPT
// ============================================================
const BOT_SYSTEM_PROMPT = [
  "You are Chat Support for VastMyWealth Advisory — a friendly and persuasive sales assistant for loans in India.",
  "",
  "YOUR IDENTITY:",
  "- Name: Chat Support",
  "- Company: VastMyWealth Advisory",
  "- Style: Friendly, warm, conversational like a helpful friend",
  "",
  "TEAM INFORMATION:",
  "- Manoj is our Relationship Manager — he handles customer follow-up and loan processing",
  "- Venkatesh is the founder/owner of VastMyWealth",
  "- If customer asks about Manoj — say: Manoj is our Relationship Manager. He will personally follow up with you after you apply!",
  "- If customer asks about Venkatesh — say: Venkatesh is our founder. For special requirements he is available.",
  "- NEVER ask customer if they ARE Manoj or any team member",
  "",
  "LOAN PRODUCTS:",
  "- Personal Loan (PL): 10.5%-18% | Rs.50,000 to Rs.40 Lakhs | Principal sanction within 24 hours*",
  "- Home Loan (HL): 8.5%-10.5% | Rs.5 Lakhs to Rs.10+ Crores | Principal sanction within 48 hours*",
  "- Business Loan (BL): 12%-24% | Rs.1 Lakh to Rs.5+ Crores | Principal sanction within 48 hours*",
  "- Loan Against Property (LAP): 9%-13% | Rs.5 Lakhs to Rs.15+ Crores | Principal sanction within 48 hours*",
  "- Balance Transfer + Top Up: Available for HL and LAP",
  "- Construction Finance: Available for builders and developers — timeline varies based on project evaluation",
  "*Subject to complete documentation. Principal sanction timeline only. Final disbursal may take additional time. Final decision by lender.",
  "",
  "WHY VASTMYWEALTH:",
  "- Multi-lender platform — best lender matched to your profile",
  "- Approval-first approach — highest approval chances",
  "- Faster processing — pre-evaluated before login",
  "- End-to-end support — application to disbursal",
  "",
  "CHANNEL PARTNER PROGRAM:",
  "- No registration fee",
  "- Commission paid post disbursement",
  "- Anyone can join — real estate agents, freelancers, DSAs, financial advisors, builders",
  "- Full support provided",
  "- You focus on sourcing — we handle the execution",
  "- NEVER say Welcome aboard or formally onboard",
  "- NEVER say best details share kar dete hain",
  "- NEVER promise exact commission numbers",
  "- If customer asks about channel partner, joining, earning, commission — templateType is ALWAYS PARTNER",
  "- Real estate consultant, broker, agent, DSA = perfect partner — still send templateType=PARTNER",
  "- First explain opportunity, collect Name + City + Profession, then set sendTemplate=true with templateType=PARTNER",
  "",
  "CIBIL SCORE KNOWLEDGE:",
  "Score ranges:",
  "- 750-900: Excellent — best rates, easy approval",
  "- 700-750: Good — most loans available",
  "- 650-700: Fair — limited options, higher rates",
  "- Below 650: Poor — difficult for PL/BL",
  "- Below 600: Very Poor — very few lenders for HL/LAP",
  "",
  "VastMyWealth CIBIL policy:",
  "- PL/BL below 650 — politely say: Aapka CIBIL score thoda improve karna hoga. 650+ hone ke baad hum best options de sakte hain!",
  "- HL/LAP below 600 — say: Low CIBIL ke saath bahut kam lenders hote hain, par hum try karenge. Final decision lender ka hoga.",
  "- HL/LAP 600-650 — can process with some lenders",
  "- Above 750 — best rates and fast approval",
  "",
  "How to improve CIBIL:",
  "1. Pay all EMIs and credit card bills on time",
  "2. Keep credit card usage below 30% of limit",
  "3. Do not apply for multiple loans at once",
  "4. Check CIBIL report for errors at cibil.com",
  "5. Do not close old credit cards",
  "6. Clear overdue payments first",
  "7. Takes 4-6 months of consistent effort",
  "",
  "Common CIBIL queries:",
  "- Checking score reduces it? NO — self-check is soft inquiry, score does not reduce",
  "- How long to improve? 4-6 months consistent effort. Major defaults may take 12-18 months.",
  "- Loan with low CIBIL? PL/BL below 650 — suggest improvement. HL/LAP below 600 — we will try.",
  "",
  "STRICT RULES — NEVER BREAK:",
  "1. NEVER guarantee approval",
  "2. NEVER promise exact rates — say rates depend on your profile",
  "3. ALWAYS say subject to eligibility and documentation",
  "4. ALWAYS say final decision by lender",
  "5. NEVER give false promises",
  "6. NEVER use words like: easily, guaranteed, 100% sure, pakka milega, definitely, confirm",
  "7. NEVER promise exact commission numbers to partners",
  "",
  "SALES APPROACH:",
  "- Be like a friendly helpful salesperson — build rapport first",
  "- Ask ONE question at a time only",
  "- Keep messages SHORT — max 3 lines",
  "- Show genuine interest in customer needs",
  "- Create mild urgency — Abhi rates bahut acche hain!",
  "- Make customer feel special",
  "- Never push hard — be helpful not pushy",
  "- READ customer message carefully — they may correct themselves, always go with latest answer",
  "",
  "CONVERSATION FLOW:",
  "Step 1: Greet warmly and ask what they need",
  "Step 2: Understand requirement carefully",
  "Step 3: Ask their name",
  "Step 4: Ask loan amount needed (for loan customers) or profession (for partners)",
  "Step 5: Ask monthly income approximately (for loan customers) or city (for partners)",
  "Step 6: Ask city (for loan customers)",
  "Step 7: Send closing message and set sendTemplate=true",
  "",
  "CLOSING MESSAGE — when sending template:",
  "- NEVER say Let me get you connected with our team",
  "- NEVER say You are all set",
  "- ALWAYS say: Please complete the application form in the next message. Our team will review and connect your application to the best lender!",
  "- For partners say: Please complete the registration form in the next message. Our team will get in touch with you shortly!",
  "- Keep it simple and action oriented",
  "",
  "WHEN CUSTOMER IS FRUSTRATED: Say I understand your concern. Our internal team will personally address your query within 24 hours.",
  "WHEN CUSTOMER WANTS HUMAN: Say Sure! Please leave your message and our team will get back to you shortly.",
  "WHEN YOU DO NOT KNOW: Say I will connect you with our team for this. They will get back to you shortly!",
  "",
  "LANGUAGE RULES:",
  "- STRICTLY detect customer language and respond in EXACT same language",
  "- If customer writes in English — respond in English only",
  "- If customer writes in Hindi — respond in Hindi only",
  "- If customer writes in Hinglish — respond in Hinglish",
  "- NEVER mix languages unless customer does first",
  "- Default to English if language is unclear",
  "- ALWAYS use Aap and Aapka — NEVER use Tum or Tumhara",
  "- Keep formal respectful tone",
  "- Do NOT use complex Hindi grammar",
  "- Keep natural like WhatsApp chat",
  "- Do NOT use bold formatting with asterisks",
  "- Do NOT send long paragraphs — max 3 lines per message",
  "- NEVER say Aap hume kaise madad kar sakte hain — you are helping THEM not the other way",
  "- ALWAYS say Main aapki kaise madad kar sakta hoon",
  "- Never apologize excessively — just move forward naturally",
  "- NEVER use bhai, yaar, dost when addressing customer — always use Aap",
  "",
  "RESPONSE FORMAT — Always respond in this exact JSON only, nothing else:",
  "{",
  "  \"message\": \"your response to customer\",",
  "  \"loanType\": \"detected loan type or null\",",
  "  \"customerName\": \"customer name if mentioned or null\",",
  "  \"loanAmount\": \"loan amount if mentioned or null\",",
  "  \"city\": \"city if mentioned or null\",",
  "  \"employmentType\": \"Salaried or Self-Employed if mentioned or null\",",
  "  \"sendTemplate\": true or false,",
  "  \"templateType\": \"HL or LAP or PL or BL or BTTU or PARTNER or CF or null\"",
  "}",
  "",
  "Set sendTemplate=true ONLY after collecting name + loan type + amount + city OR after 7 messages",
  "",
  "templateType mapping:",
  "- Home Loan = HL",
  "- LAP = LAP",
  "- Personal Loan = PL",
  "- Business Loan = BL",
  "- Balance Transfer/Top Up = BTTU",
  "- Partner/Join/Earn/Channel Partner/Commission = PARTNER",
  "- Construction Finance = CF",
  "- Unknown after 7 msgs = PL"
].join("\n");

// ============================================================
// DETECT LOAN TYPE FROM KEYWORD
// ============================================================
function detectLoanType(text) {
  if (!text) return null;
  const t = text.toUpperCase().trim();
  if (t.includes("HOME")         || t === "HL"  || t.includes("#HL"))  return "Home Loan";
  if (t.includes("BUSINESS")     || t === "BL"  || t.includes("#BL"))  return "Business Loan";
  if (t.includes("PROPERTY")     || t === "LAP" || t.includes("#LAP") ||
      t.includes("AGAINST")      || t.includes("MORTG"))               return "Loan Against Property";
  if (t.includes("PERSONAL")     || t === "PL"  || t.includes("#PL"))  return "Personal Loan";
  if (t.includes("PARTNER")      || t.includes("EARN") ||
      t.includes("JOIN")         || t.includes("AGENT") ||
      t.includes("CHANNEL"))                                            return "Partner Inquiry";
  if (t.includes("CONSTRUCTION") || t.includes("BUILDER"))             return "Construction Finance";
  if (t.includes("BALANCE")      || t.includes("TRANSFER") ||
      t.includes("TOP UP")       || t.includes("TOPUP"))               return "Balance Transfer + Top Up";
  return null;
}

// ============================================================
// SEND CORRECT TEMPLATE
// ============================================================
async function sendLoanTemplate(to, loanType) {
  const lt = (loanType || "").toUpperCase();
  if (lt.includes("HOME") || lt === "HL") {
    return await sendTemplateWithImage(to, "welcome_hl",
      "https://drive.google.com/uc?export=download&id=151p69azxUf_tcJH9uwueGtigbyqMscFk");
  } else if (lt.includes("LAP") || lt.includes("PROPERTY") || lt === "BTTU" ||
             lt.includes("BALANCE") || lt.includes("TRANSFER") || lt.includes("TOP")) {
    return await sendTemplateWithImage(to, "welcome_lap",
      "https://drive.google.com/uc?export=download&id=1WUkhuqRbtAm5hHk3dnZ8JLzYHz4E2AHq");
  } else if (lt.includes("PERSONAL") || lt === "PL" || lt.includes("BUSINESS") || lt === "BL") {
    return await sendTemplateWithImage(to, "welcome_unsecured",
      "https://drive.google.com/uc?export=download&id=1llb-yxEyzSR1JVEqdM4TmI7_ICDOFSrD");
  } else if (lt.includes("PARTNER") || lt.includes("JOIN") || lt.includes("EARN") || lt.includes("CHANNEL")) {
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
    console.log("Template check for " + mobile + ": filled=" + data.filled);
    return data.filled === true;
  } catch (err) {
    console.error("isTemplateAlreadySent error:", err.message);
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
    await fetch(url);
    console.log("Stored:", mobile);
  } catch (err) {
    console.error("storeInAppsScript error:", err.message);
  }
}

// ============================================================
// SAVE LEAD TO WA LEADS TAB
// ============================================================
async function saveLeadToSheet(mobile, name, loanType, city) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return;
    const url = process.env.APPS_SCRIPT_URL +
      "?action=storeMessage" +
      "&mobile="   + encodeURIComponent(mobile) +
      "&message="  + encodeURIComponent("Bot qualified lead") +
      "&name="     + encodeURIComponent(name     || "") +
      "&loanType=" + encodeURIComponent(loanType || "") +
      "&city="     + encodeURIComponent(city     || "");
    await fetch(url);
    console.log("Lead saved: " + mobile + " | " + name + " | " + loanType);
  } catch(e) {
    console.error("saveLeadToSheet error:", e.message);
  }
}

// ============================================================
// SEND TEXT MESSAGE
// ============================================================
async function sendTextMessage(to, text) {
  try {
    const res = await fetch(
      "https://graph.facebook.com/v18.0/" + process.env.PHONE_NUMBER_ID + "/messages",
      {
        method : "POST",
        headers: {
          "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN,
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
      "https://graph.facebook.com/v18.0/" + process.env.PHONE_NUMBER_ID + "/messages",
      {
        method : "POST",
        headers: {
          "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN,
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
    if (data.messages) { console.log("Template sent: " + templateName + " to " + to); return true; }
    console.error("Template failed:", JSON.stringify(data));
    return false;
  } catch (err) {
    console.error("sendTemplate error:", err.message);
    return false;
  }
}

// ============================================================
// SEND TEMPLATE WITH IMAGE
// ============================================================
async function sendTemplateWithImage(to, templateName, imageUrl) {
  try {
    const res = await fetch(
      "https://graph.facebook.com/v18.0/" + process.env.PHONE_NUMBER_ID + "/messages",
      {
        method : "POST",
        headers: {
          "Content-Type" : "application/json",
          "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN
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
    if (result.messages) { console.log("Template sent: " + templateName + " to " + to); return true; }
    console.log("Template failed: " + JSON.stringify(result));
    return false;
  } catch(e) {
    console.error("sendTemplateWithImage error:", e.message);
    return false;
  }
}

// ============================================================
// CALL CLAUDE AI BOT
// ============================================================
async function callClaudeBot(userMessage, history) {
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
    if (!ANTHROPIC_KEY) { console.error("ANTHROPIC_KEY not set!"); return null; }

    const messages = history.concat([{role:"user", content: userMessage}]);

    const controller = new AbortController();
    const timeout    = setTimeout(function() { controller.abort(); }, 15000);

    const res = await fetch(ANTHROPIC_URL, {
      method : "POST",
      headers: {
        "Content-Type"     : "application/json",
        "x-api-key"        : ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body  : JSON.stringify({
        model     : "claude-haiku-4-5",
        max_tokens: 400,
        system    : BOT_SYSTEM_PROMPT,
        messages  : messages
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await res.json();
    if (data.content && data.content[0]) {
      const text = data.content[0].text;
      try {
        const clean  = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        parsed.message = (parsed.message || "")
          .replace(/\\n/g, "\n")
          .replace(/\*\*/g, "*")
          .replace(/#{1,6}\s/g, "");
        return parsed;
      } catch(e) {
        const msgMatch = text.match(/"message"\s*:\s*"([\s\S]*?)(?<!\\)"/);
        if (msgMatch) {
          return {
            message     : msgMatch[1].replace(/\\n/g, "\n").replace(/\*\*/g, "*"),
            loanType    : null,
            sendTemplate: false,
            templateType: null
          };
        }
        return {message: text.split("{")[0].trim(), loanType:null, sendTemplate:false, templateType:null};
      }
    }
    return null;
  } catch(e) {
    console.error("callClaudeBot error:", e.message);
    return null;
  }
}

// ============================================================
// SAVE CONVERSATION (async)
// ============================================================
function saveConversation(mobile, role, message) {
  try {
    const url = process.env.APPS_SCRIPT_URL +
      "?action=saveConversation" +
      "&mobile="  + encodeURIComponent(mobile) +
      "&role="    + encodeURIComponent(role) +
      "&message=" + encodeURIComponent((message || "").substring(0, 500));
    fetch(url).catch(function() {});
  } catch(e) {}
}

// ============================================================
// 1. WEBHOOK VERIFICATION
// ============================================================
app.get("/webhook", function(req, res) {
  if (
    req.query["hub.mode"]         === "subscribe" &&
    req.query["hub.verify_token"] === process.env.VERIFY_TOKEN
  ) {
    console.log("Webhook verified!");
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ============================================================
// 2. RECEIVE INCOMING WHATSAPP MESSAGE
// ============================================================
app.post("/webhook", async function(req, res) {
  res.sendStatus(200);

  try {
    const entry   = req.body.entry && req.body.entry[0];
    const changes = entry && entry.changes && entry.changes[0];
    const value   = changes && changes.value;

    if (value && value.statuses) return;

    const message = value && value.messages && value.messages[0];
    if (!message) return;

    if (message.type !== "text" && message.type !== "button" && message.type !== "interactive") {
      console.log("Non-text message ignored:", message.type);
      return;
    }

    const from = message.from;
    let text   = "";

    if (message.type === "text") {
      text = (message.text && message.text.body) || "";
    } else if (message.type === "button") {
      text = (message.button && (message.button.text || message.button.payload)) || "Chat";
    } else if (message.type === "interactive") {
      text = (message.interactive && message.interactive.button_reply && message.interactive.button_reply.title) ||
             (message.interactive && message.interactive.list_reply && message.interactive.list_reply.title) || "Chat";
    }

    // Deduplicate messages
    const msgId = message.id;
    if (!conversations._processedIds) conversations._processedIds = {};
    if (conversations._processedIds[msgId]) {
      console.log("Duplicate message ignored: " + msgId);
      return;
    }
    conversations._processedIds[msgId] = true;
    const ids = Object.keys(conversations._processedIds);
    if (ids.length > 100) delete conversations._processedIds[ids[0]];

    console.log("Incoming from " + from + ": " + text);

    // STEP 1: Store message
    await storeInAppsScript(from, text);

    // STEP 2: Check if template already sent
    const alreadySent = await isTemplateAlreadySent(from);

    // If template sent BUT customer clicked Chat button — reactivate bot
    const isChatButton = text === "Chat with us" || text === "Chat" ||
                         text.toLowerCase().includes("chat with");

    if (alreadySent && !isChatButton) {
      console.log("Template already sent — bot inactive: " + from);
      return;
    }

    // STEP 3: Detect loan type from keyword
    const detectedLoanType = detectLoanType(text);
    console.log("Loan type: " + (detectedLoanType || "Unknown — AI bot"));

    // STEP 4: Short keyword + no active session = direct template
    const hasActiveSession = conversations[from] && conversations[from].msgCount > 0;
    const isShortKeyword   = text.trim().split(" ").length <= 3;

    if (detectedLoanType && isShortKeyword && !hasActiveSession) {
      console.log("Short keyword — direct template: " + from);
      await sendLoanTemplate(from, detectedLoanType);
      return;
    }

    // STEP 5: AI Bot handles
    console.log("AI Bot for " + from);

    if (!conversations[from]) {
      conversations[from] = {
        messages    : [],
        msgCount    : 0,
        loanType    : null,
        name        : null,
        city        : null,
        templateSent: false
      };
    }

    const conv = conversations[from];
    if (conv.templateSent) return;
    conv.msgCount++;

    // Call Claude
    const botResponse = await callClaudeBot(text, conv.messages);

    if (!botResponse) {
      await sendTextMessage(from, "Hi! I am Your Chat Support. How can I help you?");
      return;
    }

    // Update history
    conv.messages.push({role:"user",      content: text});
    conv.messages.push({role:"assistant", content: JSON.stringify(botResponse)});
    if (conv.messages.length > 12) conv.messages = conv.messages.slice(-12);

    if (botResponse.customerName) conv.name     = botResponse.customerName;
    if (botResponse.loanType)     conv.loanType = botResponse.loanType;
    if (botResponse.city)         conv.city     = botResponse.city;

    // Save conversation async
    saveConversation(from, "customer", text);
    saveConversation(from, "bot",      botResponse.message);

    // Send reply
    await sendTextMessage(from, botResponse.message);

    // Send template if bot decided
    if (botResponse.sendTemplate && botResponse.templateType && !conv.templateSent) {
      conv.templateSent = true;
      console.log("Bot sending template: " + botResponse.templateType + " to " + from);
      // Save lead to WA Leads
      await saveLeadToSheet(from, conv.name, conv.loanType || botResponse.templateType, conv.city);
      await new Promise(function(r) { setTimeout(r, 1500); });
      await sendLoanTemplate(from, botResponse.templateType);
      return;
    }

    // Force after 7 messages
    if (conv.msgCount >= 7 && !conv.templateSent) {
      conv.templateSent = true;
      console.log("7 messages — forcing template for " + from);
      const forcedType = conv.loanType || "Personal Loan";
      await sendTextMessage(from, "Please complete the application form in the next message. Our team will review and connect your application to the best lender!");
      // Save lead to WA Leads
      await saveLeadToSheet(from, conv.name, forcedType, conv.city);
      await new Promise(function(r) { setTimeout(r, 1500); });
      await sendLoanTemplate(from, forcedType);
    }

  } catch (err) {
    console.error("Webhook error:", err.message);
  }
});

// ============================================================
// 3. HEALTH CHECK
// ============================================================
app.get("/", function(req, res) {
  res.json({
    status : "VastMyWealth Relay v5 Running",
    version: "v5",
    time   : new Date().toISOString()
  });
});

// ============================================================
// 4. START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, function() {
  console.log("VastMyWealth Relay v5 running on port " + PORT);
});

