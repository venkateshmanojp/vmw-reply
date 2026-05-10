// ============================================================
// VastMyWealth — WhatsApp Relay Server v7
// Two Layer Flow: Priya (Welcome) + Specialists
// Updated: May 2026
// ============================================================

const express = require("express");
const fetch   = require("node-fetch");
const app     = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const RENDER_URL    = "https://vmw-ai-analyzer.onrender.com";
const conversations = {};

// ============================================================
// LAYER 1 — PRIYA (Welcome Agent)
// ============================================================
const PRIYA_PROMPT = `You are Priya — Welcome Executive at VastMyWealth Advisory.

YOUR IDENTITY:
- Name: Priya
- Role: Welcome Executive / Customer Assistance
- Company: VastMyWealth Advisory
- Style: Warm, friendly, welcoming — like a professional receptionist
- If asked if you are bot/AI — say: "I am your VastMyWealth assistant! Here to connect you with the right advisor. 😊"
- NEVER confirm you are AI or bot
- NEVER reveal you are automated

YOUR JOB:
- Greet customer warmly
- Get their name
- Understand their loan requirement (what type of loan they need)
- Get their city and state
- Then transfer to the right specialist

GREETING:
- Always say: "Hello! 😊”


WHAT TO ASK (one at a time):
Step 1: Greet warmly and ask their name and age together.
Step 2: Ask what financial assistance they need (DO NOT list loan products — just ask openly)
Step 3: Ask which city and state they are from
Step 4: Transfer to specialist

TRANSFER MESSAGE (based on loan type):
- Home Loan / LAP / BT+TU → Transfer to Rahul
- Personal Loan → Transfer to Amit  
- Business Loan → Transfer to Vikram
- Construction Finance → Transfer to Venkatesh
- Partner → Transfer to Rahul

Transfer message format:
"Thank you [Name]! 😊
Let me connect you with [Specialist Name] — our [Specialist Title] who will find the best solution for you!

Please hold for a moment... 🔄"

STRICT RULES:
- NEVER mention what loans VastMyWealth offers
- NEVER ask technical questions — that is specialist's job
- ONLY collect: name, requirement, city, state
- Ask ONE question at a time
- Be warm and welcoming always
- NEVER give phone numbers
- NEVER mention Manoj

LANGUAGE:
- Detect customer language and respond in same language
- English first, then adapt
- Hinglish if customer uses mix
- Formal and respectful always
- No bold formatting
- Max 3 lines per message

RESPONSE FORMAT — Always respond in this exact JSON only:
{
  "message": "your response to customer",
  "customerName": "name if collected or null",
  "loanType": "loan type if mentioned or null",
  "city": "city if mentioned or null",
  "state": "state if mentioned or null",
  "transferToSpecialist": true or false,
  "specialistName": "Rahul or Amit or Vikram or Venkatesh or null"
}

Set transferToSpecialist=true ONLY after collecting name + loan type + city`;

// ============================================================
// LAYER 2 — SPECIALIST PROMPTS
// ============================================================

function getSpecialistPrompt(specialistName, loanType, customerName, city, state) {
  const cityState = city ? (state ? city + ", " + state : city) : "your city";

  const specialists = {
    "Rahul"    : { title: "Senior Loan Advisor",          loans: "Home Loan and Loan Against Property" },
    "Amit"     : { title: "Personal Finance Advisor",     loans: "Personal Loan" },
    "Vikram"   : { title: "Business Finance Expert",      loans: "Business Loan" },
    "Venkatesh": { title: "Construction Finance Specialist", loans: "Construction Finance" }
  };

  const spec = specialists[specialistName] || specialists["Rahul"];

  const loanQuestions = {
    "Home Loan": `
QUESTIONS TO ASK FOR HOME LOAN (one at a time):
1. Fresh loan or Balance Transfer + Top Up?
2. Salaried or Self Employed?
3. If Salaried: Company name, total experience, years in current company, salary in bank?
   If Self Employed: Business type, years in business, GST registered?
4. Monthly income (approximate)
5. Loan amount required
6. Approximate CIBIL score (suggest PaisaBazaar/GPay app if not known)
7. Any existing EMIs? Which bank, how much per month?
8. Any cheque or ECS bounces in last 6 months?
9. Property — ready possession or under construction?
10. Property location and approximate value
11. Co-applicant available? (spouse/family member with income)
12. Preferred callback date and time`,

    "Loan Against Property": `
QUESTIONS TO ASK FOR LAP (one at a time):
1. Fresh LAP or Balance Transfer?
2. Salaried or Self Employed?
3. If Salaried: Company name, experience, salary in bank?
   If Self Employed: Business type, vintage, GST?
4. Monthly income (approximate)
5. Loan amount required
6. Purpose of LAP (business expansion, debt consolidation, construction etc)
7. Approximate CIBIL score
8. Any existing loans? Which bank, outstanding amount, current ROI, current EMI?
9. Any bounces in last 6 months?
10. Property type — residential or commercial?
11. Property location and approximate value
12. Society registered? (MCGM/GP/SRA/MHADA/CHS)
13. Co-applicant available?
14. Preferred callback date and time`,

    "Personal Loan": `
QUESTIONS TO ASK FOR PERSONAL LOAN (one at a time):
1. Company name and designation
2. Total work experience and years in current company
3. Salary credited to bank account? (not cash)
4. Monthly net salary
5. Loan amount required
6. Approximate CIBIL score
7. Any existing EMIs? Amount per month?
8. Any credit enquiries in last 1 month?
9. Any cheque/ECS bounces in last 6 months?
10. Preferred callback date and time`,

    "Business Loan": `
QUESTIONS TO ASK FOR BUSINESS LOAN (one at a time):
1. Business type (Proprietorship/Partnership/Pvt Ltd)
2. Years in business (vintage)
3. GST registered?
4. Business bank account available?
5. Monthly income/turnover approximately
6. Loan amount required and purpose
7. Approximate CIBIL score
8. Any existing loans? EMI amount?
9. Any bounces in last 6 months?
10. Preferred callback date and time`,

    "Construction Finance": `
QUESTIONS TO ASK FOR CONSTRUCTION FINANCE (one at a time):
1. Builder/Developer or Individual construction?
2. Project location
3. Project type (residential/commercial)
4. Total project cost
5. Stage of construction (land acquired/foundation/ongoing)
6. Land ownership status (own/purchased/leased)
7. Approvals in place? (CC/OC/Building plan)
8. Funding required
9. Expected completion date
10. Preferred callback date and time`
  };

  const lt = (loanType || "").toUpperCase();
  let questions = loanQuestions["Home Loan"]; // default
  if (lt.includes("PERSONAL"))    questions = loanQuestions["Personal Loan"];
  if (lt.includes("BUSINESS"))    questions = loanQuestions["Business Loan"];
  if (lt.includes("LAP") || lt.includes("PROPERTY") || lt.includes("AGAINST")) questions = loanQuestions["Loan Against Property"];
  if (lt.includes("CONSTRUCTION")) questions = loanQuestions["Construction Finance"];
  if (lt.includes("BALANCE") || lt.includes("TRANSFER")) questions = loanQuestions["Loan Against Property"];

  return `You are ${specialistName} — ${spec.title} at VastMyWealth Advisory.

YOUR IDENTITY:
- Name: ${specialistName}
- Role: ${spec.title}
- Company: VastMyWealth Advisory
- Specialization: ${spec.loans}
- If asked if you are bot/AI — say: "I am your VastMyWealth ${spec.title}! Here to get you the best deal. 😊"
- NEVER confirm you are AI or bot

CUSTOMER CONTEXT (already collected by Priya):
- Customer Name: ${customerName || "Customer"}
- Loan Type: ${loanType || "Not specified"}
- Location: ${cityState}

OPENING MESSAGE (first message as specialist):
OPENING MESSAGE (first message as specialist):
"Hi ${customerName || "there"}! 😊 This is ${specialistName} here.

I can see you need ${loanType || "a loan"} in ${cityState} — let me help you with that!

Just a few quick questions to find you the best deal."

RULES FOR OPENING:
- Keep opening to 3 lines maximum
- Sound natural — not dramatic
- Do NOT say "give me a moment"
- Do NOT use 🔄 emoji in opening
- Do NOT say "let me go through your requirement"
- Jump straight to first question after intro

Let me ask you a few quick questions to find the absolute best deal for you!"

PERSONALITY:
- Warm and genuinely helpful like a personal advisor
- Knowledgeable — give expert insights naturally
- Encouraging and positive
- Never rush customer
- Show genuine interest
- Make customer feel they are talking to a real expert
- When customer shares good details — appreciate genuinely
- When profile is weak — be empathetic, suggest improvements

${questions}

QUALIFICATION CRITERIA:
Age: Maximum age at LAST EMI = 60 years (no exceptions)
Income: Above ₹25,000 → proceed | ₹15,000-25,000 → limited options | Below ₹15,000 → decline
CIBIL PL/BL: Minimum 700 | Below 700 → decline (suggest LAP if property available)
CIBIL HL/LAP: Minimum 650 | 650-700 → limited lenders
FOIR: Maximum 50% of income for EMIs
Bounces: 0 → excellent | 1-2 → limited | 3+ → decline
Work experience (salaried): Minimum 1 year total
Business vintage (BL): Minimum 3 years
Salary must be in bank (not cash)
Credit enquiries PL/BL: 3+ in last month → decline

CO-APPLICANT (HL/LAP only):
- Suggest co-applicant if income low or CIBIL borderline
- Co-applicant can be spouse, parent, child
- NOT required for PL/BL

LOAN ELIGIBILITY:
- PL/BL: Maximum 10-12x monthly income
- HL/LAP: Maximum 60x monthly income
- If unrealistic amount → tell customer maximum eligible

OVERDUE HANDLING:
- Overdue on unsecured loan → suggest LAP if property available

CALLBACK SCHEDULING:
When customer gives preferred time:
"Perfect! Manoj is available on [date] at [time].
Callback confirmed! 📅

Please keep your phone available at that time."

IMPORTANT — Date conversion rules:
- NEVER store "Tomorrow" — convert to actual date e.g. "11 May 2026"
- NEVER store "Monday" — convert to actual date
- NEVER store "Day after tomorrow" — convert to actual date
- Always store callbackDate as: "11 May 2026" format
- Always store callbackTime as: "3:00 PM" format
- Today's date reference: use current IST date


Your callback is confirmed! ✅"

BEFORE CLOSING — ALWAYS ASK:
"[Name] one last thing — is there anything specific
you would like our banker to know about your case?

For example any special circumstances, urgency,
or previous loan history.

This helps us structure your file for best
approval chances and avoid unnecessary login
which could affect your CIBIL! 😊"

Wait for customer response → note it → then proceed to closing message.

CLOSING MESSAGE (after all questions answered + callback scheduled):
"[Name] your profile looks really promising! 😊

We have strong lender options in [City, State]!

Our Banking RM Manoj will personally coordinate 
with lenders in [City] for you!

Please save Manoj's number:
📱 9594592020 — Manoj (Your Banking RM)

He will call you very soon! 😊”

DECLINE MESSAGE (if not eligible):
"[Name] I appreciate you sharing your details! 😊

Based on your current profile, [specific reason].

Here is what I suggest:
[specific actionable advice]

Once your profile improves, we will be delighted to process your application! 😊
VastMyWealth is always here for you!"

STRICT RULES:
- NEVER repeat a question already answered
- ALWAYS check what Priya already collected (name, loan type, city, state)
- NEVER ask for name, loan type, city again — already collected!
- Ask ONE question at a time
- NEVER give exact interest rates — say depends on profile
- NEVER guarantee approval
- NEVER use: guaranteed, pakka, 100% sure, definitely
- NEVER mention Banking Portal
- NEVER ask for documents — just qualify
- NEVER give phone number except in closing message
- Final decision always by lender

LANGUAGE RULES:
- Detect customer language and respond in same
- English first then adapt
- Hinglish if customer uses mix
- Always use Aap/Aapka — never Tum/Tumhara
- Formal respectful tone
- No bold formatting with asterisks
- Max 3 lines per message
- Natural WhatsApp chat style

RESPONSE FORMAT — Always respond in this exact JSON only:
{
  "message": "your response to customer",
  "customerName": "name or null",
  "loanType": "loan type or null",
  "city": "city or null",
  "state": "state or null",
  "employmentType": "Salaried or Self-Employed or null",
  "monthlyIncome": "income if mentioned or null",
  "cibilScore": "CIBIL if mentioned or null",
  "existingEMI": "EMI amount if mentioned or null",
  "bounces": "bounce count if mentioned or null",
  "loanAmount": "amount if mentioned or null",
  "companyName": "company/business if mentioned or null",
  "workExperience": "experience if mentioned or null",
  "businessVintage": "vintage if mentioned or null",
  "propertyDetails": "property details if mentioned or null",
  "coApplicant": "co-applicant details if mentioned or null",
  "callbackDate": "callback date if confirmed or null",
  "callbackTime": "callback time if confirmed or null",
  "qualificationStatus": "ELIGIBLE or DECLINED or IN_PROGRESS",
  "sendCaseSummary": true or false
}

Set sendCaseSummary=true ONLY when:
- ALL questions answered ✅
- Callback date AND time confirmed ✅
- qualificationStatus is ELIGIBLE ✅
- NEVER set true before all questions answered
- NEVER set true before callback scheduled`;
}

// ============================================================
// PARTNER PROMPT
// ============================================================
const PARTNER_PROMPT = `You are Rahul — Senior Loan Advisor at VastMyWealth Advisory.

YOUR IDENTITY:
- Name: Rahul
- Role: Senior Loan Advisor + Partner Relations
- Company: VastMyWealth Advisory

PARTNER PROGRAM:
- No registration fee
- Attractive commission on every disbursement
- NEVER disclose exact commission amounts
- Anyone can join — real estate agents, DSAs, financial advisors, builders
- Full support provided
- If asked commission — say: "Commission is very competitive and varies by product. Full details shared after registration!"

PARTNER VERIFICATION:
- Ask: "Please share your registered mobile number to login"
- Check partnerStatus from system
- If approved → "Welcome back [Name]! Let's check your client's eligibility. Please share client details!"
- If pending → "Your registration is under review. Venkatesh will approve shortly!"
- If not found → Give registration pitch

REGISTRATION PITCH:
"Hi! Welcome to VastMyWealth Advisory! 😊

Here is why top professionals partner with us:

💰 EARN WITH US:
✅ Attractive commission on every disbursement
✅ Multiple loan products — more earning opportunities
✅ Faster processing = faster payouts

🚀 WHAT YOU GET:
✅ Instant eligibility check for clients
✅ Dedicated relationship manager
✅ 100% digital — no paperwork
✅ Real time case tracking

Ready to grow your income?
Please register: https://forms.gle/LWN949M1k9khsUrGA

Any questions? I am here! 😊"

RESPONSE FORMAT:
{
  "message": "response",
  "partnerMode": true,
  "partnerVerified": true or false,
  "sendCaseSummary": false
}`;

// ============================================================
// DETECT LOAN TYPE
// ============================================================
function detectLoanType(text) {
  if (!text) return null;
  const t = text.toUpperCase().trim();
  if (t.includes("HOME")         || t === "HL"  || t.includes("#HL"))  return "Home Loan";
  if (t.includes("BUSINESS")     || t === "BL"  || t.includes("#BL"))  return "Business Loan";
  if (t.includes("PROPERTY")     || t === "LAP" || t.includes("#LAP") ||
      t.includes("AGAINST")      || t.includes("MORTG"))               return "Loan Against Property";
  if (t.includes("PERSONAL")     || t === "PL"  || t.includes("#PL"))  return "Personal Loan";
  if (t === "LOANS" || t === "LOAN")                                    return "Personal Loan";
  if (t.includes("PARTNER")      || t.includes("EARN") ||
      t.includes("JOIN")         || t.includes("AGENT") ||
      t === "PARTNER LOGIN")                                            return "Partner";
  if (t.includes("CONSTRUCTION") || t.includes("BUILDER"))             return "Construction Finance";
  if (t.includes("BALANCE")      || t.includes("TRANSFER") ||
      t.includes("TOP UP")       || t.includes("TOPUP"))               return "Balance Transfer + Top Up";
  return null;
}

// ============================================================
// GET SPECIALIST NAME FROM LOAN TYPE
// ============================================================
function getSpecialistName(loanType) {
  if (!loanType) return "Rahul";
  const lt = loanType.toUpperCase();
  if (lt.includes("PERSONAL"))                                          return "Amit";
  if (lt.includes("BUSINESS"))                                          return "Vikram";
  if (lt.includes("CONSTRUCTION"))                                      return "Venkatesh";
  return "Rahul"; // HL, LAP, BT+TU, Partner
}

// ============================================================
// GET IST TIME GREETING
// ============================================================
function getTimeGreeting() {
  const ist  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hour = ist.getHours();
  if (hour >= 6  && hour < 12) return "Good Morning! 😊";
  if (hour >= 12 && hour < 17) return "Good Afternoon! ☀️";
  if (hour >= 17 && hour < 21) return "Good Evening! 🌆";
  return "Hello! 😊";
}

// ============================================================
// TRIGGER CASE SUMMARY
// ============================================================
async function triggerCaseSummary(session, from) {
  try {
    console.log("Triggering case summary for: " + from);

    const payload = {
      action          : "case-summary",
      mobile          : from,
      name            : session.name            || "",
      age             : session.customerAge     || "",
      loanType        : session.loanType        || "",
      loanAmount      : session.loanAmount      || "",
      city            : session.city            || "",
      state           : session.state           || "",
      employmentType  : session.employmentType  || "",
      monthlyIncome   : session.monthlyIncome   || "",
      cibilScore      : session.cibilScore      || "",
      existingEMI     : session.existingEMI     || "",
      bounces         : session.bounces         || "",
      companyName     : session.companyName     || "",
      workExperience  : session.workExperience  || "",
      businessVintage : session.businessVintage || "",
      propertyDetails : session.propertyDetails || "",
      coApplicant     : session.coApplicant     || "",
      callbackDate    : session.callbackDate    || "",
      callbackTime    : session.callbackTime    || "",
      specialistName  : session.specialistName  || "",
      partnerCode     : session.partnerCode     || "",
      isPartnerCase   : session.partnerMode     || false,
      conversationSummary: session.messages.slice(-15).map(m => m.role + ": " + m.content).join("\n")
    };
    console.log("Callback check — date:", session.callbackDate, "time:", session.callbackTime);

// Save callback time to sheet
if (session.callbackDate && session.callbackTime) {
  fetch(process.env.APPS_SCRIPT_URL +
  "?action=saveCallback" +
  "&mobile="       + encodeURIComponent(from) +
  "&callbackDate=" + encodeURIComponent(session.callbackDate) +
  "&callbackTime=" + encodeURIComponent(session.callbackTime) +
  "&name="         + encodeURIComponent(session.name     || "") +
  "&loanType="     + encodeURIComponent(session.loanType || "")

  ).catch(e => console.error("saveCallback error:", e.message));
}

    fetch(RENDER_URL + "/case-summary", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(payload)
    }).catch(e => console.error("triggerCaseSummary fetch error:", e.message));

    console.log("✅ Case summary triggered for: " + from);
  } catch(e) {
    console.error("triggerCaseSummary error:", e.message);
  }
}

// ============================================================
// SAVE LEAD TO WA LEADS
// ============================================================
async function saveLeadToSheet(mobile, name, loanType, city, status) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return;
    const url = process.env.APPS_SCRIPT_URL +
      "?action=storeMessage" +
      "&mobile="   + encodeURIComponent(mobile) +
      "&message="  + encodeURIComponent(status || "Bot qualified lead") +
      "&name="     + encodeURIComponent(name     || "") +
      "&loanType=" + encodeURIComponent(loanType || "") +
      "&city="     + encodeURIComponent(city     || "");
    await fetch(url);
  } catch(e) {
    console.error("saveLeadToSheet error:", e.message);
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
  } catch(e) {
    console.error("storeInAppsScript error:", e.message);
  }
}

// ============================================================
// SAVE CONVERSATION
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
          text             : { body: text }
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
// CALL CLAUDE
// ============================================================
async function callClaude(userMessage, history, systemPrompt) {
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
    if (!ANTHROPIC_KEY) return null;

    const messages = history.concat([{ role: "user", content: userMessage }]);

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(ANTHROPIC_URL, {
      method : "POST",
      headers: {
        "Content-Type"     : "application/json",
        "x-api-key"        : ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model     : "claude-haiku-4-5",
        max_tokens: 600,
        system    : systemPrompt,
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
          .replace(/\*\*/g, "")
          .replace(/#{1,6}\s/g, "");
        return parsed;
      } catch(e) {
        return { message: text.split("{")[0].trim(), sendCaseSummary: false };
      }
    }
    return null;
  } catch(e) {
    console.error("callClaude error:", e.message);
    return null;
  }
}

// ============================================================
// CHECK IF ALREADY PROCESSED
// ============================================================
async function isTemplateAlreadySent(mobile) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return false;
    const url  = process.env.APPS_SCRIPT_URL + "?mobile=" + encodeURIComponent(mobile);
    const res  = await fetch(url);
    const data = await res.json();
    return data.filled === true;
  } catch(e) {
    return false;
  }
}

// ============================================================
// CHECK PARTNER STATUS
// ============================================================
async function checkPartnerStatus(mobile) {
  try {
    const clean = mobile.replace(/\D/g, "").slice(-10);
    const url   = process.env.APPS_SCRIPT_URL +
      "?action=checkPartner&mobile=" + encodeURIComponent(clean);
    const res   = await fetch(url);
    const data  = await res.json();
    return data;
  } catch(e) {
    console.error("checkPartnerStatus error:", e.message);
    return { found: false, approved: false };
  }
}

// ============================================================
// WEBHOOK VERIFICATION
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
// RECEIVE INCOMING WHATSAPP MESSAGE
// ============================================================
app.post("/webhook", async function(req, res) {
  res.sendStatus(200);

  try {
    const entry   = req.body.entry   && req.body.entry[0];
    const changes = entry            && entry.changes && entry.changes[0];
    const value   = changes          && changes.value;

    if (value && value.statuses) return;

    const message = value && value.messages && value.messages[0];
    if (!message) return;

    const from    = message.from;
    const msgType = message.type;
    let   text    = "";

    if (msgType === "text") {
      text = (message.text && message.text.body) || "";
    } else if (msgType === "button") {
      text = (message.button && (message.button.text || message.button.payload)) || "Chat";
    } else if (msgType === "interactive") {
      text = (message.interactive && message.interactive.button_reply &&
              message.interactive.button_reply.title) ||
             (message.interactive && message.interactive.list_reply &&
              message.interactive.list_reply.title) || "Chat";
    } else {
      // For images/documents — acknowledge but don't process
      await sendTextMessage(from, "Thank you for sharing! 😊 Our team will review this.\n\nIf you have any questions please feel free to ask!");
      return;
    }

    // Deduplicate
    const msgId = message.id;
    if (!conversations._processedIds) conversations._processedIds = {};
    if (conversations._processedIds[msgId]) return;
    conversations._processedIds[msgId] = true;
    const ids = Object.keys(conversations._processedIds);
    if (ids.length > 200) delete conversations._processedIds[ids[0]];

    console.log("Incoming from " + from + ": " + text.substring(0, 50));

    // Store message
    await storeInAppsScript(from, text);

    // Initialize session
    if (!conversations[from]) {
      conversations[from] = {
        layer           : "priya",    // Start with Priya
        specialistName  : null,
        messages        : [],
        priyaMessages   : [],
        msgCount        : 0,
        name            : null,
        customerAge     : null,
        loanType        : null,
        loanAmount      : null,
        city            : null,
        state           : null,
        employmentType  : null,
        monthlyIncome   : null,
        cibilScore      : null,
        existingEMI     : null,
        bounces         : null,
        companyName     : null,
        workExperience  : null,
        businessVintage : null,
        propertyDetails : null,
        coApplicant     : null,
        callbackDate    : null,
        callbackTime    : null,
        partnerMode     : false,
        partnerCode     : null,
        caseSummarySent : false,
        greeting        : getTimeGreeting()
      };
    }

    const session = conversations[from];
    session.msgCount++;

    // ── CASE ALREADY DONE ────────────────────────────────
    if (session.caseSummarySent) {
      await sendTextMessage(from, "Hi! 😊 Your case is already with our team.\n\nOur Banking RM Manoj will connect with you on the scheduled date and time.\n\nFor any urgent queries feel free to message here!");
      return;
    }

    // ── PARTNER LOGIN ────────────────────────────────────
    if (text.toUpperCase() === "PARTNER LOGIN") {
      session.layer       = "partner";
      session.partnerMode = true;
      await sendTextMessage(from, "Welcome to VastMyWealth Partner Portal! 😊\n\nPlease share your registered mobile number to login.");
      return;
    }

    // ── PARTNER MOBILE VERIFICATION ──────────────────────
    if (session.layer === "partner" && session.awaitingPartnerMobile) {
      const partnerMobile = text.replace(/\D/g, "").slice(-10);
      if (partnerMobile.length === 10) {
        session.awaitingPartnerMobile = false;
        const partnerStatus = await checkPartnerStatus(partnerMobile);
        if (partnerStatus.approved) {
          session.partnerCode = partnerStatus.code;
          session.partnerName = partnerStatus.name;
          await sendTextMessage(from, `Welcome back ${partnerStatus.name}! 😊\n\nLet's check your client's eligibility.\nPlease share the client's loan requirement and details!`);
        } else if (partnerStatus.found) {
          await sendTextMessage(from, "Your registration is under review. Venkatesh will approve shortly! We will notify you. 😊");
        } else {
          await sendTextMessage(from, `Hi! Welcome to VastMyWealth Advisory! 😊\n\nI see you are not registered as a partner yet.\n\nHere is why top professionals partner with us:\n\n💰 Attractive commission on every disbursement\n✅ Multiple loan products\n✅ Instant eligibility check for clients\n✅ Dedicated relationship manager\n\nReady to grow your income?\nRegister here: https://forms.gle/LWN949M1k9khsUrGA`);
        }
        return;
      }
    }

    // ── DETERMINE SYSTEM PROMPT ──────────────────────────
    let systemPrompt;
    let currentHistory;

    if (session.layer === "priya") {
      systemPrompt   = PRIYA_PROMPT;
      currentHistory = session.priyaMessages;
    } else if (session.layer === "partner") {
      systemPrompt   = PARTNER_PROMPT;
      currentHistory = session.messages;
    } else {
      // Specialist layer
      systemPrompt   = getSpecialistPrompt(
        session.specialistName,
        session.loanType,
        session.name,
        session.city,
        session.state
      );
      currentHistory = session.messages;
    }

    // ── CALL CLAUDE ──────────────────────────────────────
    const botResponse = await callClaude(text, currentHistory, systemPrompt);

    if (!botResponse) {
      const greeting = session.greeting || "Hello";
      await sendTextMessage(from, greeting + " Welcome to VastMyWealth Advisory! I'm Priya. How can I assist you today? 😊");
      return;
    }

    // Update history
    currentHistory.push({ role: "user",      content: text });
    currentHistory.push({ role: "assistant",  content: JSON.stringify(botResponse) });
    if (currentHistory.length > 20) {
      const keep = currentHistory.slice(-20);
      if (session.layer === "priya") session.priyaMessages = keep;
      else session.messages = keep;
    }

    // Extract data
    if (botResponse.customerName)    session.name            = botResponse.customerName;
    if (botResponse.customerAge)     session.customerAge     = botResponse.customerAge;
    if (botResponse.loanType)        session.loanType        = botResponse.loanType;
    if (botResponse.loanAmount)      session.loanAmount      = botResponse.loanAmount;
    if (botResponse.city)            session.city            = botResponse.city;
    if (botResponse.state)           session.state           = botResponse.state;
    if (botResponse.employmentType)  session.employmentType  = botResponse.employmentType;
    if (botResponse.monthlyIncome)   session.monthlyIncome   = botResponse.monthlyIncome;
    if (botResponse.cibilScore)      session.cibilScore      = botResponse.cibilScore;
    if (botResponse.existingEMI)     session.existingEMI     = botResponse.existingEMI;
    if (botResponse.bounces)         session.bounces         = botResponse.bounces;
    if (botResponse.companyName)     session.companyName     = botResponse.companyName;
    if (botResponse.workExperience)  session.workExperience  = botResponse.workExperience;
    if (botResponse.businessVintage) session.businessVintage = botResponse.businessVintage;
    if (botResponse.propertyDetails) session.propertyDetails = botResponse.propertyDetails;
    if (botResponse.coApplicant)     session.coApplicant     = botResponse.coApplicant;
    if (botResponse.callbackDate)    session.callbackDate    = botResponse.callbackDate;
    if (botResponse.callbackTime)    session.callbackTime    = botResponse.callbackTime;

    // Save conversation
    saveConversation(from, "customer", text);
    saveConversation(from, "bot", botResponse.message);

    // Send reply
    if (botResponse.message) {
      await sendTextMessage(from, botResponse.message);
    }

    // ── PRIYA TRANSFERS TO SPECIALIST ────────────────────
    if (session.layer === "priya" && botResponse.transferToSpecialist && botResponse.specialistName) {
      session.layer          = "specialist";
      session.specialistName = botResponse.specialistName;
      session.messages       = []; // Fresh history for specialist

      console.log("Transferring " + from + " to " + botResponse.specialistName);

      // Small delay then specialist introduces
      await new Promise(r => setTimeout(r, 4000));

      const specPrompt  = getSpecialistPrompt(
        botResponse.specialistName,
        session.loanType,
        session.name,
        session.city,
        session.state
      );

      const introResponse = await callClaude(
        "START — introduce yourself to the customer as the specialist",
        [],
        specPrompt
      );

      if (introResponse && introResponse.message) {
        await sendTextMessage(from, introResponse.message);
        session.messages.push({ role: "assistant", content: JSON.stringify(introResponse) });
      }

      // Save lead
      await saveLeadToSheet(from, session.name, session.loanType, session.city, "Qualifying");
      return;
    }

    // ── TRIGGER CASE SUMMARY ─────────────────────────────
    if (botResponse.sendCaseSummary && !session.caseSummarySent) {
      const hasMinInfo = session.name && session.loanType &&
                         session.city && session.monthlyIncome &&
                         session.callbackDate && session.callbackTime;

      if (hasMinInfo) {
        session.caseSummarySent = true;
        console.log("Case summary triggered for: " + from);

        // Save lead with Case Ready status
        await saveLeadToSheet(from, session.name, session.loanType, session.city, "Case Ready");

        // Trigger case summary
        await triggerCaseSummary(session, from);
      }
    }

    // ── HANDLE DECLINED ──────────────────────────────────
    if (botResponse.qualificationStatus === "DECLINED") {
      await saveLeadToSheet(from, session.name, session.loanType, session.city, "Declined");
    }

  } catch(err) {
    console.error("Webhook error:", err.message);
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get("/", function(req, res) {
  res.json({
    status : "VastMyWealth Relay v7 — Priya + Specialists Active",
    version: "v7",
    time   : new Date().toISOString()
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, function() {
  console.log("🚀 VastMyWealth Relay v7 running on port " + PORT);
});

