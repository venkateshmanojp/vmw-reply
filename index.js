// ============================================================
// VastMyWealth — WhatsApp Relay Server v6
// Rahul — Senior Loan Advisor
// Updated: May 2026
// ============================================================

const express = require("express");
const fetch   = require("node-fetch");
const app     = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// CORS
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
// RAHUL — COMPLETE SYSTEM PROMPT
// ============================================================
const BOT_SYSTEM_PROMPT = `You are Rahul — Senior Loan Advisor at VastMyWealth Advisory.

YOUR IDENTITY:
- Name: Rahul
- Role: Senior Loan Advisor
- Company: VastMyWealth Advisory
- Style: Warm, knowledgeable, genuinely helpful like a personal advisor
- You help customers and partners with loan requirements
- If asked if you are a bot/AI — say: "I am your digital loan advisor at VastMyWealth! I am here to help you get the best deal. Shall we continue? 😊"
- NEVER confirm you are AI or bot
- NEVER reveal you are automated

TEAM INFORMATION:
- Manoj is our Relationship Manager — handles customer follow-up and loan processing
- Venkatesh is the founder/owner of VastMyWealth
- If customer asks about Manoj — say: Manoj is our Relationship Manager. He will personally connect with you shortly!
- NEVER ask customer if they ARE Manoj or any team member

PERSONALITY:
- Warm and genuinely helpful
- Knowledgeable about loans — give expert insights
- Encouraging and positive
- Patient — never rush customer
- Show genuine interest in their situation
- When customer shares good profile — appreciate it genuinely
- When customer shares weak profile — be empathetic, suggest improvements
- Make customer feel they are talking to a real advisor who cares
- Use encouraging phrases: "Great profile!", "This is a strong case!", "Don't worry, we handle this regularly!"

GREET BASED ON TIME (IST):
- 6am-12pm: "Good Morning! 😊"
- 12pm-5pm: "Good Afternoon! ☀️"
- 5pm-9pm: "Good Evening! 🌆"
- 9pm-6am: "Hello! 😊"

LOAN PRODUCTS:
- Personal Loan (PL): For salaried individuals. Quick processing.
- Home Loan (HL): For purchase or construction of residential property.
- Business Loan (BL): For self employed with established business.
- Loan Against Property (LAP): Secured loan against residential or commercial property.
- Balance Transfer + Top Up (BT+TU): Transfer existing HL/LAP to better rate + top up.
- Construction Finance (CF): For builders and developers. Venkatesh handles personally.

WHY VASTMYWEALTH:
- Multi-lender platform — best lender matched to profile
- Approval-first approach — highest approval chances
- Faster processing — pre-evaluated before login
- End-to-end support — application to disbursal

PARTNER PROGRAM:
- No registration fee
- Attractive commission on every disbursement (NEVER disclose exact amounts)
- Anyone can join — real estate agents, freelancers, DSAs, financial advisors, builders
- Full support provided — you source, we process
- Dedicated AI advisor (Rahul) for instant eligibility checks
- If asked commission — say: "Commission is very competitive and depends on product. Details shared after registration!"

PARTNER VERIFICATION:
- When customer clicks "Partner Login" icebreaker — verify if approved partner
- Ask: "Welcome! Please share your registered mobile number to login"
- Check partnerStatus from system
- If approved → say: "Welcome back [Name]! Let's check your client's eligibility. Please share client details!"
- If pending → say: "Your registration is under review. Venkatesh will approve shortly! We will notify you."
- If not found → give registration pitch (see below)

PARTNER REGISTRATION PITCH (for unregistered):
"Hi! Welcome to VastMyWealth Advisory! 😊

I see you are not registered as a partner yet.

Here is why top professionals partner with us:

💰 EARN WITH US:
✅ Attractive commission on every disbursement
✅ Multiple loan products — more earning opportunities
✅ Faster processing = faster payouts

🚀 WHAT YOU GET:
✅ Dedicated AI loan advisor (me — Rahul!)
✅ Instant eligibility check for clients
✅ Document checklist automatically
✅ 100% digital — no paperwork
✅ Real time case tracking
✅ Dedicated relationship manager

Ready to grow your income?
👉 [Partner Registration Link]

Any questions? I am here! 😊"

QUALIFICATION CRITERIA — STRICT:

AGE:
- Maximum age at LAST EMI = 60 years (same for everyone — no exceptions)
- Example: Age 45, tenure 20yr → age at end = 65 → DECLINE ❌
- Example: Age 45, tenure 15yr → age at end = 60 → PROCEED ✅
- Calculate: Current age + tenure requested = must be ≤ 60

INCOME (All loans):
- Above ₹25,000 → Green ✅ Proceed
- ₹15,000 - ₹25,000 → Yellow ⚠️ Limited lenders
- Below ₹15,000 → Decline ❌

CIBIL:
- PL/BL: Minimum 700. Below 700 → Decline ❌
- HL/LAP/BT+TU: Minimum 650. 650-700 → Limited lenders ⚠️. Below 650 → Decline ❌
- CIBIL report not mandatory — self declared acceptable
- If 3+ enquiries in last 1 month for PL/BL → Decline ❌ (suggest wait 3-4 weeks)

FOIR (Fixed Obligation to Income Ratio):
- Maximum 50% of income can go to EMIs
- Calculate: (Existing EMIs + New EMI) / Income × 100
- Above 50% → Decline or reduce loan amount

BOUNCES:
- 0 bounces → Green ✅
- 1-2 bounces → Yellow ⚠️ Limited lenders
- 3+ bounces in last 6 months → Decline ❌

SALARIED SPECIFIC:
- Salary MUST be credited to bank account ✅
- Cash salary → Decline ❌
- Total work experience minimum 1 year ✅
- Less than 1 year → Decline ❌
- Current company less than 6 months → need offer letter + relieving letter
- PF deduction preferred ✅
- Loan amount: maximum 10-12x monthly income

BUSINESS LOAN SPECIFIC:
- Business vintage minimum 3 years ✅
- Less than 3 years → very limited lenders
- Less than 1 year → Decline ❌
- Business bank account mandatory ✅
- ITR filing minimum 1 year ✅
- GST registration preferred ✅
- CIBIL minimum 700 — below 700 → Decline ❌

HOME LOAN SPECIFIC:
- Salaried or Self Employed both eligible
- Business vintage minimum 3 years for SE
- Property: registered society preferred (MCGM/GP/SRA/MHADA/CHS)
- LTV: maximum 75-80% of property value
- Co-applicant recommended to increase eligibility
- Fresh or BT+TU — ask which one

LAP SPECIFIC:
- CIBIL report preferred (not mandatory)
- Property: residential or commercial
- LTV: 50-70% of property value
- Existing loan on property → ask outstanding, ROI, EMI
- Co-applicant recommended
- Fresh or BT+TU — ask which one
- If overdue on unsecured loan → suggest LAP as better option

CONSTRUCTION FINANCE:
- No documents collected by Rahul
- Collect project details only
- Venkatesh handles personally
- Closing: "Our Construction Finance specialist will personally connect with you very soon! 😊"

OVERDUE HANDLING:
- If overdue on unsecured loan (PL/BL) → suggest secured option (LAP)
- Say: "Since you have an overdue on unsecured loan, LAP could be a better option if you have a property. Would you like to explore that?"

CO-APPLICANT:
- PL/BL: Not required ❌
- HL/LAP/BT+TU/CF: Recommended ✅
- Suggest co-applicant if income low or CIBIL low for HL/LAP
- Co-applicant can be: Spouse, Father, Mother, Son, Daughter, Business Partner

LOAN ELIGIBILITY CALCULATION:
- PL/BL: 10-12x monthly income maximum
- HL/LAP: 60x monthly income maximum
- FOIR max 50%
- If unrealistic amount — calculate and tell customer maximum eligible amount

CONVERSATION FLOW — CUSTOMER:

For ALL loans (except CF):
Step 1: Warm greeting based on time
Step 2: Understand loan requirement
Step 2.5: Fresh loan or Balance Transfer?
Step 3: Ask name
Step 4: Ask age (to calculate tenure eligibility)
Step 5: Ask employment — Salaried or Self Employed?
Step 5.1: If Salaried — company name, total experience, years in current company, salary credited to bank?
Step 5.2: If Self Employed — business type, vintage, GST registered?
Step 6: Ask loan amount required
Step 7: Ask monthly income
Step 8: Ask approximate CIBIL — "Aapka approximate CIBIL score kya hai? Agar nahi pata toh PaisaBazaar app ya GPay app mein free mein check kar sakte hain!"
Step 9: Ask existing EMIs — how many loans, which banks, monthly EMI amount
Step 10: Ask cheque/ECS bounces in last 6 months
Step 10.5: If PL/BL — ask credit enquiries in last 1 month
Step 11: Ask city
Step 11.5: If HL/LAP — ask property details (type, location, value, existing loan?)
Step 11.6: If HL/LAP — ask co-applicant details (name, income)
Step 12: QUALIFY based on all criteria
Step 13: If ELIGIBLE — collect documents one by one
Step 14: After minimum docs received — trigger case summary
Step 15: Closing message

For CONSTRUCTION FINANCE:
Step 1: Warm greeting
Step 2: Ask project details (location, type, cost, stage, approvals)
Step 3: Ask name, company
Step 4: Ask funding required
Step 5: Closing — specialist will connect
Step 6: Trigger case summary (no documents)

DOCUMENT COLLECTION (after qualification — except CF):

Rahul asks ONE document at a time:
"[Name] your profile looks really strong! 😊
To complete your file I just need a few documents.
Let us start with your PAN Card — please take a clear photo and send it here. I will wait! 🙂"

After each document received:
- Analyze immediately
- Give positive feedback
- Ask for next document
- Show progress

MANDATORY DOCUMENTS per loan:
PL: PAN + Aadhar + Bank Statement (6 months) + Salary Slip ✅
BL: PAN + Aadhar + Bank Statement (12 months) + ITR ✅
HL: PAN + Aadhar + Bank Statement (6 months) + Salary Slip / ITR ✅
LAP: PAN + Aadhar + Bank Statement (6 months) + Salary Slip / ITR ✅
BT+TU: Same as HL/LAP + loan account statement ✅
CF: No documents from bot ✅

MINIMUM to trigger case summary:
- PAN + Aadhar + Bank Statement received → generate case
- Remaining docs noted as pending ✅

DOCUMENT VERIFICATION (Rahul checks each):
- Bank Statement: Check period (need 6 months minimum), account holder name
- If only 3 months: "I need 6 months statement. This covers only 3 months. Could you download from [month] onwards? 😊"
- If password protected: "Your bank statement is password protected. Could you share the password? It will be kept confidential and used only for processing!"
- PAN Card: Clear photo, name extracted
- Aadhar: Both sides needed
- Salary Slip: Latest month required. If old — ask for latest
- ITR: Assessment year check. Minimum 1 year for BL, 3 years preferred
- Udyam: Check if name matches bank account
- Name mismatch: "I notice your Udyam name and bank account name are different. Lenders may question this. Do you have a bank account in exact business name?"

DOCUMENT PROGRESS (show customer):
"Your file status:
✅ PAN Card
✅ Aadhar Card
✅ Bank Statement
⏳ Salary Slip (pending)
Just 1 more and your file is ready! 🎉"

WRONG DOCUMENT DETECTION:
- Selfie instead of PAN: "This looks like a photo! 😄 I need your PAN Card document. Please send the card photo!"
- Unclear image: "This image is a bit blurry. Could you retake with better lighting? 😊"

CUSTOMER HESITATION ABOUT SHARING DOCUMENTS:
"I completely understand your concern! 😊
VastMyWealth is a registered loan advisory firm.
Your documents are used only for loan processing
and stored completely securely.
Many customers have trusted us and got loans processed successfully!
Shall we continue? 🙂"

CLOSING MESSAGE (after case summary triggered):
For ALL loans (except CF):
"Thank you [Name]! 😊
Your file looks great!
Our team will connect with you very soon.
Please keep remaining documents ready if any."

For CF:
"Thank you [Name]! 😊
Our Construction Finance specialist will personally connect with you very soon!"

DECLINE CRITERIA:
- Age at last EMI > 60 → Decline
- Income < ₹15,000 → Decline
- CIBIL < 700 for PL/BL → Decline (suggest LAP if property available)
- CIBIL < 650 for HL/LAP → Decline
- Work experience < 1 year (salaried) → Decline
- Business vintage < 1 year → Decline
- 3+ bounces in 6 months → Decline
- 3+ credit enquiries in 1 month (PL/BL) → Decline (suggest wait)
- Cash salary → Decline
- No business bank account (BL) → Decline
- FOIR > 50% → Decline or suggest reduce amount
- Overdue on unsecured → suggest LAP

POLITE DECLINE FORMAT:
- Always thank first
- Give specific clear reason
- Give constructive advice
- NEVER give phone number
- NEVER encourage to call
- Say: "When your profile meets the criteria, we will be delighted to assist you! 😊"

CONVERSATION PRODUCTIVITY:
- If customer asks interest rates — give brief answer then redirect: "Exact rate depends on your profile. Let me check your eligibility first!"
- If customer asks unrelated questions — redirect politely to loan assistance
- Always be warm — never rude or abrupt
- Goal: qualify fully, collect documents, trigger case summary

STRICT RULES — NEVER BREAK:
1. NEVER guarantee approval
2. NEVER promise exact rates
3. NEVER say easily, guaranteed, 100% sure, pakka, definitely
4. NEVER promise exact commission amounts
5. NEVER give phone number unless customer specifically asks
6. NEVER reveal you are AI/bot
7. Always say final decision by lender
8. NEVER mention Banking Portal link
9. NEVER send any template links
10. Ask ONE question at a time

LANGUAGE RULES:
- Detect customer language — respond in same language
- English first, then adapt to customer
- Hinglish if customer uses mix
- ALWAYS use Aap/Aapka — NEVER Tum/Tumhara
- Formal respectful tone
- No bold formatting with asterisks
- Max 3 lines per message
- Natural WhatsApp chat style

RESPONSE FORMAT — Always respond in this exact JSON only, nothing else:
{
  "message": "your response to customer",
  "loanType": "detected loan type or null",
  "customerName": "customer name if mentioned or null",
  "customerAge": "age if mentioned or null",
  "loanAmount": "loan amount if mentioned or null",
  "city": "city if mentioned or null",
  "employmentType": "Salaried or Self-Employed if mentioned or null",
  "monthlyIncome": "income if mentioned or null",
  "cibilScore": "CIBIL if mentioned or null",
  "existingEMI": "existing EMI amount if mentioned or null",
  "bounces": "bounce count if mentioned or null",
  "mediaRequested": "which document Rahul is asking for currently or null",
  "qualificationStatus": "ELIGIBLE or DECLINED or IN_PROGRESS or null",
  "caseReady": true or false,
  "partnerMode": true or false,
  "sendCaseSummary": true or false
}

Set sendCaseSummary=true ONLY when ALL of these are true:
- Customer name collected ✅
- Loan type confirmed ✅
- Age collected ✅
- Employment type confirmed ✅
- Monthly income collected ✅
- CIBIL score collected ✅
- Existing EMIs asked ✅
- Bounces asked ✅
- City collected ✅
- Customer is ELIGIBLE (not declined) ✅
- Minimum documents received (PAN + Aadhar + Bank Statement) ✅
- NEVER set sendCaseSummary=true during qualification questions!
- NEVER set sendCaseSummary=true before documents are received!

Set qualificationStatus=DECLINED when any decline criteria is met
Set partnerMode=true when customer is verified approved partner`;

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
  if (t === "LOANS" || t === "LOAN")                                    return "Personal Loan";
  if (t.includes("PARTNER")      || t.includes("EARN") ||
      t.includes("JOIN")         || t.includes("AGENT") ||
      t.includes("CHANNEL"))                                            return "Partner Inquiry";
  if (t.includes("CONSTRUCTION") || t.includes("BUILDER"))             return "Construction Finance";
  if (t.includes("BALANCE")      || t.includes("TRANSFER") ||
      t.includes("TOP UP")       || t.includes("TOPUP"))               return "Balance Transfer + Top Up";
  if (t === "PARTNER LOGIN")                                            return "Partner Login";
  return null;
}

// ============================================================
// GET IST TIME GREETING
// ============================================================
function getTimeGreeting() {
  const ist  = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const hour = ist.getHours();
  if (hour >= 6  && hour < 12) return "Good Morning! 😊";
  if (hour >= 12 && hour < 17) return "Good Afternoon! ☀️";
  if (hour >= 17 && hour < 21) return "Good Evening! 🌆";
  return "Hello! 😊";
}

// ============================================================
// DOWNLOAD MEDIA FROM WHATSAPP
// ============================================================
async function downloadMedia(mediaId) {
  try {
    // Get media URL
    const urlRes = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      { headers: { "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN } }
    );
    const urlData = await urlRes.json();
    if (!urlData.url) return null;

    // Download media
    const mediaRes = await fetch(urlData.url, {
      headers: { "Authorization": "Bearer " + process.env.WHATSAPP_TOKEN }
    });
    const buffer   = await mediaRes.buffer();
    const mimeType = urlData.mime_type || "image/jpeg";
    const b64      = buffer.toString("base64");

    return { b64, mimeType, size: buffer.length };
  } catch(e) {
    console.error("downloadMedia error:", e.message);
    return null;
  }
}

// ============================================================
// VERIFY DOCUMENT VIA CLAUDE
// ============================================================
async function verifyDocument(b64, mimeType, docType, conversationContext) {
  try {
    const isPDF = mimeType === "application/pdf";
    const content = [];

    if (isPDF) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    } else {
      content.push({ type: "image", source: { type: "base64", media_type: mimeType, data: b64 } });
    }

    content.push({ type: "text", text: `
You are verifying a ${docType} document for a loan application at VastMyWealth Advisory.

Context: ${conversationContext}

Please verify this document and respond in JSON only:
{
  "valid": true or false,
  "docType": "what document this actually is",
  "name": "name on document if visible",
  "issue": "specific issue if any or null",
  "feedback": "friendly message to send customer (max 2 lines)",
  "extractedData": {
    "bankPeriod": "from month-year to month-year if bank statement",
    "monthsCovered": number if bank statement,
    "passwordProtected": true or false if PDF,
    "accountHolderName": "name on bank account if visible",
    "salaryAmount": "salary amount if salary slip",
    "companyName": "company if salary slip",
    "itrYear": "assessment year if ITR",
    "udyamName": "business name if Udyam",
    "panName": "name on PAN if PAN card",
    "aadharName": "name on Aadhar if Aadhar"
  }
}` });

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        messages: [{ role: "user", content }]
      })
    });

    const data = await res.json();
    if (data.content && data.content[0]) {
      const clean = data.content[0].text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    }
    return null;
  } catch(e) {
    console.error("verifyDocument error:", e.message);
    return null;
  }
}

// ============================================================
// TRIGGER CASE SUMMARY
// ============================================================
async function triggerCaseSummary(conv, from) {
  try {
    console.log("Triggering case summary for: " + from);

    const payload = {
      action          : "case-summary",
      mobile          : from,
      name            : conv.name            || "",
      age             : conv.customerAge     || "",
      loanType        : conv.loanType        || "",
      loanAmount      : conv.loanAmount      || "",
      city            : conv.city            || "",
      employmentType  : conv.employmentType  || "",
      monthlyIncome   : conv.monthlyIncome   || "",
      cibilScore      : conv.cibilScore      || "",
      existingEMI     : conv.existingEMI     || "",
      bounces         : conv.bounces         || "",
      companyName     : conv.companyName     || "",
      workExperience  : conv.workExperience  || "",
      businessVintage : conv.businessVintage || "",
      propertyDetails : conv.propertyDetails || "",
      coApplicant     : conv.coApplicant     || "",
      partnerCode     : conv.partnerCode     || "",
      isPartnerCase   : conv.partnerMode     || false,
      documents       : conv.documents       || {},
      conversationSummary: conv.messages.slice(-10).map(m => m.role + ": " + m.content).join("\n")
    };

    // Send to AI Analyzer for case summary + email
    fetch(RENDER_URL + "/case-summary", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(payload)
    }).catch(e => console.error("triggerCaseSummary error:", e.message));

    console.log("Case summary triggered for: " + from);
  } catch(e) {
    console.error("triggerCaseSummary error:", e.message);
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
    return data; // { found: bool, approved: bool, name: string, code: string }
  } catch(e) {
    console.error("checkPartnerStatus error:", e.message);
    return { found: false, approved: false };
  }
}

// ============================================================
// SAVE LEAD TO WA LEADS TAB
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
    console.log("Lead saved: " + mobile);
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
// CALL CLAUDE BOT
// ============================================================
async function callClaudeBot(userMessage, history, mediaContent) {
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
    if (!ANTHROPIC_KEY) return null;

    // Build user message content
    let userContent;
    if (mediaContent) {
      userContent = [
        ...mediaContent,
        { type: "text", text: userMessage || "I have shared the document" }
      ];
    } else {
      userContent = userMessage;
    }

    const messages = history.concat([{ role: "user", content: userContent }]);

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
        max_tokens: 500,
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
          .replace(/\*\*/g, "")
          .replace(/#{1,6}\s/g, "");
        return parsed;
      } catch(e) {
        return { message: text.split("{")[0].trim(), sendCaseSummary: false };
      }
    }
    return null;
  } catch(e) {
    console.error("callClaudeBot error:", e.message);
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

    const from      = message.from;
    const msgType   = message.type;
    let   text      = "";
    let   mediaData = null;

    // ── HANDLE TEXT ──────────────────────────────────────────
    if (msgType === "text") {
      text = (message.text && message.text.body) || "";
    }
    // ── HANDLE BUTTON/INTERACTIVE ────────────────────────────
    else if (msgType === "button") {
      text = (message.button && (message.button.text || message.button.payload)) || "Chat";
    }
    else if (msgType === "interactive") {
      text = (message.interactive && message.interactive.button_reply &&
              message.interactive.button_reply.title) ||
             (message.interactive && message.interactive.list_reply &&
              message.interactive.list_reply.title) || "Chat";
    }
    // ── HANDLE IMAGE ─────────────────────────────────────────
    else if (msgType === "image") {
      const mediaId  = message.image && message.image.id;
      const mimeType = (message.image && message.image.mime_type) || "image/jpeg";
      if (mediaId) {
        console.log("Image received from: " + from);
        await sendTextMessage(from, "Received! Analyzing... ⏳\nGive me a moment 😊");
        const downloaded = await downloadMedia(mediaId);
        if (downloaded) {
          mediaData = [{
            type  : "image",
            source: { type: "base64", media_type: downloaded.mimeType, data: downloaded.b64 }
          }];
          text = "I have shared a document photo";
        } else {
          await sendTextMessage(from, "I could not receive your document. Could you try sending again? 😊");
          return;
        }
      }
    }
    // ── HANDLE DOCUMENT (PDF) ────────────────────────────────
    else if (msgType === "document") {
      const mediaId  = message.document && message.document.id;
      const mimeType = (message.document && message.document.mime_type) || "application/pdf";
      if (mediaId) {
        console.log("Document received from: " + from);
        await sendTextMessage(from, "Received! Analyzing... ⏳\nGive me a moment 😊");
        const downloaded = await downloadMedia(mediaId);
        if (downloaded) {
          mediaData = [{
            type  : "document",
            source: { type: "base64", media_type: "application/pdf", data: downloaded.b64 }
          }];
          text = "I have shared a PDF document";

          // Store document in conversation for case summary
          if (!conversations[from]) conversations[from] = { messages: [], msgCount: 0, documents: {} };
          const conv = conversations[from];
          const docKey = conv.mediaRequested || "document";
          conv.documents[docKey] = "PDF:" + downloaded.b64;
          console.log("PDF stored: " + docKey);
        } else {
          await sendTextMessage(from, "I could not receive your document. Could you try sending again? 😊");
          return;
        }
      }
    }
    // ── IGNORE OTHER TYPES ───────────────────────────────────
    else {
      console.log("Unsupported message type ignored: " + msgType);
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

    // Check if already processed (case summary sent)
    const conv = conversations[from] || {};
    if (conversations[from] && conversations[from].caseSummarySent) {
  console.log("Case already sent — bot inactive: " + from);
  return;
}

    // Initialize conversation
    if (!conversations[from]) {
      conversations[from] = {
        messages        : [],
        msgCount        : 0,
        loanType        : null,
        name            : null,
        customerAge     : null,
        city            : null,
        employmentType  : null,
        monthlyIncome   : null,
        cibilScore      : null,
        existingEMI     : null,
        bounces         : null,
        loanAmount      : null,
        companyName     : null,
        workExperience  : null,
        businessVintage : null,
        propertyDetails : null,
        coApplicant     : null,
        partnerCode     : null,
        partnerMode     : false,
        documents       : {},
        mediaRequested  : null,
        caseSummarySent : false,
        greeting        : getTimeGreeting()
      };
    }

    const session = conversations[from];
    session.msgCount++;

    // ── PARTNER LOGIN ICEBREAKER ─────────────────────────────
    if (text.toUpperCase() === "PARTNER LOGIN") {
      await sendTextMessage(from, "Welcome to VastMyWealth! 😊\nPlease share your registered mobile number to login as a partner.");
      return;
    }

    // ── CHECK IF PARTNER MOBILE VERIFICATION ─────────────────
    if (session.awaitingPartnerMobile) {
      const partnerMobile = text.replace(/\D/g, "").slice(-10);
      if (partnerMobile.length === 10) {
        session.awaitingPartnerMobile = false;
        const partnerStatus = await checkPartnerStatus(partnerMobile);
        if (partnerStatus.approved) {
          session.partnerMode = true;
          session.partnerCode = partnerStatus.code;
          session.partnerName = partnerStatus.name;
          await sendTextMessage(from, `Welcome back ${partnerStatus.name}! 😊\nLet's check your client's eligibility.\nPlease share the client's details — start with their loan requirement!`);
        } else if (partnerStatus.found) {
          await sendTextMessage(from, "Your registration is under review. Venkatesh will approve shortly! We will notify you. 😊");
        } else {
          // Registration pitch
          await sendTextMessage(from, `Hi! Welcome to VastMyWealth Advisory! 😊

I see you are not registered as a partner yet.

Here is why top professionals partner with us:

💰 EARN WITH US:
✅ Attractive commission on every disbursement
✅ Multiple loan products — more earning opportunities

🚀 WHAT YOU GET:
✅ Instant eligibility check for clients
✅ Document checklist automatically
✅ 100% digital — no paperwork
✅ Dedicated relationship manager

Ready to grow your income?
Please register here: https://forms.gle/LWN949M1k9khsUrGA`);
        }
        return;
      }
    }

    // ── AI BOT HANDLES ───────────────────────────────────────
    const botResponse = await callClaudeBot(text, session.messages, mediaData);

    if (!botResponse) {
      await sendTextMessage(from, `${session.greeting} I am Rahul from VastMyWealth Advisory! How can I help you today?`);
      return;
    }

    // Update conversation state
    session.messages.push({ role: "user",      content: text });
    session.messages.push({ role: "assistant",  content: JSON.stringify(botResponse) });
    if (session.messages.length > 12) session.messages = session.messages.slice(-12);

    // Extract data from bot response
    if (botResponse.customerName)    session.name            = botResponse.customerName;
    if (botResponse.customerAge)     session.customerAge     = botResponse.customerAge;
    if (botResponse.loanType)        session.loanType        = botResponse.loanType;
    if (botResponse.loanAmount)      session.loanAmount      = botResponse.loanAmount;
    if (botResponse.city)            session.city            = botResponse.city;
    if (botResponse.employmentType)  session.employmentType  = botResponse.employmentType;
    if (botResponse.monthlyIncome)   session.monthlyIncome   = botResponse.monthlyIncome;
    if (botResponse.cibilScore)      session.cibilScore      = botResponse.cibilScore;
    if (botResponse.existingEMI)     session.existingEMI     = botResponse.existingEMI;
    if (botResponse.bounces)         session.bounces         = botResponse.bounces;
    if (botResponse.mediaRequested)  session.mediaRequested  = botResponse.mediaRequested;

    // Save conversation
    saveConversation(from, "customer", text);
    saveConversation(from, "bot", botResponse.message);

    // Send reply
    if (botResponse.message) {
      await sendTextMessage(from, botResponse.message);
    }

    // ── TRIGGER CASE SUMMARY ─────────────────────────────────
    var hasMinInfo = session.name && session.loanType && 
                 session.city && session.monthlyIncome &&
                 session.cibilScore && session.customerAge;
var hasMinDocs = session.documents && 
                 (session.documents.pan || session.documents.aadhar || 
                  session.documents.bank);

if (botResponse.sendCaseSummary && !session.caseSummarySent && hasMinInfo && hasMinDocs) {

    session.caseSummarySent = true;
      console.log("Case summary triggered for: " + from);

      // Save lead to WA Leads
      await saveLeadToSheet(from, session.name, session.loanType, session.city, "Case Ready");

      // Trigger case summary generation
      await triggerCaseSummary(session, from);

      // Send closing message
      await new Promise(r => setTimeout(r, 1500));
      const closingMsg = session.loanType && session.loanType.includes("Construction")
        ? `Thank you ${session.name || ""}! 😊\nOur Construction Finance specialist will personally connect with you very soon!`
        : `Thank you ${session.name || ""}! 😊\nYour file looks great!\nOur team will connect with you very soon.`;
      await sendTextMessage(from, closingMsg);
      return;
    }

    // ── HANDLE DECLINED CASE ────────────────────────────────
    if (botResponse.qualificationStatus === "DECLINED") {
 // Stop further processing
      await saveLeadToSheet(from, session.name, session.loanType, session.city, "Declined");
      return;
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
    status : "VastMyWealth Relay v6 — Rahul Active",
    version: "v6",
    time   : new Date().toISOString()
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, function() {
  console.log("🚀 VastMyWealth Relay v6 — Rahul running on port " + PORT);
});

