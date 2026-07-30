// ============================================================
// VastMyWealth — WhatsApp Relay Server (Final Consolidated v2)
// Two Layer Flow: Priya (Welcome) + Specialists
// 9-field case brief, no AI analyzer, strict incremental rejection,
// portal continue/wait buttons, company type capture,
// age/CIBIL rejection alternatives (family member / property-LAP)
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
const conversations = {};

// ============================================================
// LAYER 1 — PRIYA (Welcome Agent)
// Collects: name, age, loan type, city, pincode
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

YOUR JOB — collect ONLY these fields, in any order that feels natural in conversation:
- Name
- Age
- What loan/financial assistance they need (DO NOT list loan products — just ask openly)
- City and pincode

GREETING:
- Always say: "Hello! 😊"

RULES:
- Ask ONE question at a time
- Do not ask about CIBIL, bounces, income, employment, or anything else — that is the specialist's job
- Once name + age + loan type + city + pincode are ALL collected, transfer to specialist
- NEVER mention what loans VastMyWealth offers
- NEVER give phone numbers
- NEVER mention any staff name

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
  "customerAge": "age if collected or null",
  "loanType": "loan type if mentioned or null",
  "city": "city if mentioned or null",
  "pincode": "pincode if mentioned or null",
  "transferToSpecialist": true or false,
  "specialistName": "Rahul or Amit or Vikram or Venkatesh or null"
}

Set transferToSpecialist=true ONLY after collecting name + age + loanType + city + pincode`;

// ============================================================
// LAYER 2 — SPECIALIST (single flexible prompt for all loan types)
// Collects: employmentType, gstDate + companyType (self-employed only),
//           cibilScore, loanAmount, bounces, enquiries + enquiryLenders
// ============================================================
function getSpecialistPrompt(specialistName, loanType, customerName, city, pincode, age) {

  const cityPin = city ? (pincode ? city + " - " + pincode : city) : "your city";

  const specialists = {
    "Rahul"    : { title: "Senior Loan Advisor",             loans: "Home Loan and Loan Against Property" },
    "Amit"     : { title: "Personal Finance Advisor",        loans: "Personal Loan" },
    "Vikram"   : { title: "Business Finance Expert",         loans: "Business Loan" },
    "Venkatesh": { title: "Construction Finance Specialist", loans: "Construction Finance" }
  };

  const spec = specialists[specialistName] || specialists["Rahul"];

  return `You are ${specialistName} — ${spec.title} at VastMyWealth Advisory.

YOUR IDENTITY:
- Name: ${specialistName}
- Role: ${spec.title}
- Company: VastMyWealth Advisory
- Specialization: ${spec.loans}
- If asked if you are bot/AI — say: "I am your VastMyWealth ${spec.title}! Here to get you the best deal. 😊"
- NEVER confirm you are AI or bot

CUSTOMER CONTEXT (already collected by Priya — do NOT ask again):
- Customer Name: ${customerName || "Customer"}
- Age: ${age || "Not mentioned"}
- Loan Type: ${loanType || "Not specified"}
- Location: ${cityPin}

OPENING MESSAGE (first message as specialist):
"Hello ${customerName || "there"}! 😊

This is ${specialistName} here.

Give me a moment — let me go through your requirement...

Ok! I can see you are looking for ${loanType || "a loan"} in ${cityPin}.

Let me ask you a few quick questions to find you the best deal!"

FIELDS YOU MUST COLLECT — ask ONE at a time, IN ANY ORDER that fits the conversation naturally:
${specialistName === "Vikram" ? `1. This is a Business Loan — the customer is Self-Employed by default. Do NOT ask if they are salaried or self-employed.
2. GST registration date/year (ask directly)
3. Type of company — Proprietorship, Partnership, Pvt Ltd, or LLP (ask directly)` : `1. Employment type — Salaried or Self-Employed
2. If Self-Employed ONLY: date/year GST was registered, AND type of company — Proprietorship, Partnership, Pvt Ltd, or LLP (skip both entirely if Salaried)`}
4. Approximate CIBIL score (suggest checking on GPay/PaisaBazaar if not sure)
5. Loan amount required
6. Any cheque/ECS bounces in last 6 months (get a number, 0 if none). If the count is more than 0, ALSO ask: (a) were these bounces cleared/regularized since?, and (b) which loan had the bounce — Personal Loan, Business Loan, Home Loan, LAP, or Other. Do NOT skip these two follow-ups when bounces > 0.
7. Any credit enquiries in last 3 months — get the count AND which lender(s) if the customer knows

Do NOT ask about: monthly income, existing EMI amount, work experience, business vintage, property details, co-applicant, or callback timing. None of these are needed.

IMPORTANT — CHECK ELIGIBILITY AS SOON AS CIBIL AND BOUNCES ARE KNOWN:
Do not keep asking further questions to a lead that already fails eligibility. Evaluate immediately using:

QUALIFICATION CRITERIA:
- Age: if age > 60, DECLINE immediately (cannot complete standard tenure)
- CIBIL for Personal Loan / Business Loan: minimum 700 → below 700 DECLINE immediately
- CIBIL for Home Loan / LAP / Construction Finance: minimum 650 → below 650 DECLINE immediately
- Bounces for Personal Loan / Business Loan: must be 0, UNLESS the bounces were cleared/regularized — if cleared, do not decline on this basis. If not cleared, DECLINE immediately.
- Bounces for Home Loan / LAP / Construction Finance: max 2 allowed, UNLESS cleared — if cleared, do not decline on this basis. If not cleared and bounces > 2, DECLINE immediately.
- Do NOT decide decline/eligible based on bounces until you have asked whether they were cleared (and which loan type had the bounce, if bounces > 0). Ask that first, then evaluate.
- Enquiries in last 3 months: NO auto-decline — just record the count and lender names, this is shown to the banker, not a rejection trigger

The moment you receive a CIBIL score or bounce count that fails the above, STOP asking further questions and set qualificationStatus=DECLINED with the decline message below. Do not proceed to remaining fields.

DECLINE MESSAGE (when a criterion fails):
"[Name] I appreciate you sharing your details! 😊

Based on your current profile, [specific reason — low CIBIL / bounces / age].

Here is what I suggest:
[specific actionable advice — e.g. improve CIBIL over 3-6 months, or maintain clean repayment for 6 months]

Once your profile improves, we will be delighted to process your application! 😊
VastMyWealth is always here for you!"

CLOSING (only once ALL required fields are collected AND qualificationStatus is ELIGIBLE):
Simply confirm the profile looks good and that document checklist + next steps will follow — the actual closing message and document checklist are sent separately by the system, not by you. Just set sendCaseSummary=true.

PERSONALITY:
- Warm and genuinely helpful like a personal advisor
- Never rush customer, but never linger on a lead that already fails eligibility
- When profile is weak — be empathetic, suggest improvements

STRICT RULES:
- NEVER repeat a question already answered
- NEVER ask for name, age, loan type, city again — already collected by Priya!
- Ask ONE question at a time
- NEVER give exact interest rates — say depends on profile
- NEVER guarantee approval
- NEVER use: guaranteed, pakka, 100% sure, definitely
- NEVER ask for documents
- NEVER mention any staff name, the underwriting team, phone numbers, or any callback timing (e.g. "shortly", "will call you") at any point — all of that is handled separately by the system after this conversation, not by you
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
  "employmentType": "Salaried or Self-Employed or null",
  "gstDate": "GST registration date/year if self-employed, else null",
  "companyType": "Proprietorship, Partnership, Pvt Ltd, or LLP if self-employed, else null",
  "cibilScore": "CIBIL if mentioned or null",
  "loanAmount": "amount if mentioned or null",
  "bounces": "bounce count if mentioned or null",
  "bounceCleared": "Yes or No if bounces > 0, else null",
  "bounceLoanType": "Personal Loan, Business Loan, Home Loan, LAP, or Other if bounces > 0, else null",
  "enquiries": "enquiry count in last 3 months if mentioned or null",
  "enquiryLenders": "lender name(s) for those enquiries if mentioned or null",
  "qualificationStatus": "ELIGIBLE or DECLINED or IN_PROGRESS",
  "sendCaseSummary": true or false
}

Set sendCaseSummary=true ONLY when:
- employmentType, (gstDate AND companyType if self-employed), cibilScore, loanAmount, bounces, enquiries are ALL collected ✅
- qualificationStatus is ELIGIBLE ✅
- NEVER set true before all required fields answered
- NEVER set true if qualificationStatus is DECLINED`;
}

// ============================================================
// PARTNER PROMPT (unchanged)
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
- If pending → "Your registration is under review. Approval team will confirm shortly!"
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
// STRICT ELIGIBILITY CHECK — shared by Priya-level and specialist-level
// ============================================================
function checkRejection(session) {
  const loanType = (session.loanType || "").toLowerCase();
  const isPLBL    = loanType.indexOf("personal") !== -1 || loanType.indexOf("business") !== -1;
  const age       = parseInt(session.customerAge || "0") || 0;
  const cibil     = parseInt((session.cibilScore || "0").toString().replace(/[^0-9]/g, "")) || 0;
  const bounces   = session.bounces === null || session.bounces === undefined ? -1 : parseInt(session.bounces) || 0;

  if (age > 60) return "age";

  if (cibil > 0) {
    if (isPLBL && cibil < 700) return "cibil_plbl";
    if (!isPLBL && cibil < 650) return "cibil_other";
  }

  if (bounces > 0) {
    if (session.bounceCleared === null || session.bounceCleared === undefined) {
      return ""; // don't decide yet — model needs to ask if cleared first
    }
    const cleared = session.bounceCleared.toString().toLowerCase() === "yes";
    if (!cleared) {
      if (isPLBL) return "bounces_plbl";
      if (!isPLBL && bounces > 2) return "bounces_other";
    }
  }

  return "";
}

function checkManualReview(session) {
  const loanType = (session.loanType || "").toLowerCase();
  const isPLBL   = loanType.indexOf("personal") !== -1 || loanType.indexOf("business") !== -1;
  const bounces  = session.bounces != null ? parseInt(session.bounces) || 0 : 0;
  const bounceLoanType = (session.bounceLoanType || "").toLowerCase();
  const bounceWasUnsecured = bounceLoanType.indexOf("personal") !== -1 || bounceLoanType.indexOf("business") !== -1;

  if (!isPLBL && bounces > 0 && bounceWasUnsecured) {
    return "Prior bounce on " + (session.bounceLoanType || "an unsecured loan") + " — now applying for " + (session.loanType || "a secured loan") + ". Manual review recommended.";
  }
  return "";
}

function rejectMessageFor(reason) {
  const messages = {
    age          : "Thank you for sharing! 🙏\n\nUnfortunately for this loan type, the maximum age at last EMI is 60 years, which your current age does not allow for a standard tenure.\n\nDo reach out to us if a co-applicant with suitable age is available, or for other options in future! 😊\n\n*VastMyWealth Advisory*",
    cibil_plbl   : "Thank you for sharing! 🙏\n\nFor a Personal/Business Loan, a minimum CIBIL score of 700 is required.\n\n*To improve your score:*\n→ Clear all overdue EMIs ✅\n→ Avoid new credit applications ✅\n→ Maintain 0 bounces for 6 months ✅\n→ Keep credit utilization below 30% ✅\n\nYour score should improve in 3-6 months. We will be happy to assist you then! 😊\n\n*VastMyWealth Advisory*",
    cibil_other  : "Thank you for sharing! 🙏\n\nFor this loan type, a minimum CIBIL score of 650 is required.\n\n*To improve your score:*\n→ Clear all overdue payments ✅\n→ Maintain regular EMI payments ✅\n→ Avoid multiple loan applications ✅\n\nYour score should improve in 3-6 months. We will be happy to assist you then! 😊\n\n*VastMyWealth Advisory*",
    bounces_plbl : "Thank you for sharing! 🙏\n\nFor a Personal/Business Loan, a clean repayment track record with zero bounces is required.\n\n*Our suggestion:*\n→ Maintain clean account for 6 months ✅\n→ Ensure sufficient balance on EMI dates ✅\n→ Clear any pending dues ✅\n\nPlease contact us after 6 months of clean history! 😊\n\n*VastMyWealth Advisory*",
    bounces_other: "Thank you for sharing! 🙏\n\nYour account shows more than 2 bounces which affects loan eligibility.\n\n*Our suggestion:*\n→ Maintain clean account for 6 months ✅\n→ Clear all pending dues ✅\n→ Ensure sufficient balance on EMI dates ✅\n\nPlease contact us after improving your repayment history! 😊\n\n*VastMyWealth Advisory*"
  };
  return messages[reason] || "Thank you for sharing! 🙏\n\nBased on your current profile we are unable to proceed at this time. We will be happy to assist you once your profile improves! 😊\n\n*VastMyWealth Advisory*";
}

function rejectReasonLabel(reason, session) {
  const cibil   = session.cibilScore || "-";
  const bounces = session.bounces != null ? session.bounces : "-";
  const age     = session.customerAge || "-";
  const labels = {
    age          : "Age " + age + " (>60)",
    cibil_plbl   : "CIBIL " + cibil + " (<700 required)",
    cibil_other  : "CIBIL " + cibil + " (<650 required)",
    bounces_plbl : "Bounces " + bounces + " (must be 0)",
    bounces_other: "Bounces " + bounces + " (>2 allowed)"
  };
  return labels[reason] || reason;
}

// ============================================================
// PERSIST PARTIAL FIELDS — called on any rejection so the sheet
// still has whatever was collected up to that point
// ============================================================
function persistPartialFields(session, from) {
  try {
    fetch(process.env.APPS_SCRIPT_URL +
      "?action=saveLeadData" +
      "&mobile="         + encodeURIComponent(from) +
      "&age="            + encodeURIComponent(session.customerAge    || "") +
      "&employmentType=" + encodeURIComponent(session.employmentType || "") +
      "&gstDate="        + encodeURIComponent(session.gstDate        || "") +
      "&companyType="    + encodeURIComponent(session.companyType    || "") +
      "&pincode="        + encodeURIComponent(session.pincode        || "") +
      "&cibilScore="     + encodeURIComponent(session.cibilScore     || "") +
      "&loanAmount="     + encodeURIComponent(session.loanAmount     || "") +
      "&bounces="         + encodeURIComponent(session.bounces != null ? session.bounces : "") +
      "&bounceCleared="   + encodeURIComponent(session.bounceCleared  || "") +
      "&bounceLoanType="  + encodeURIComponent(session.bounceLoanType || "") +
      "&enquiries="      + encodeURIComponent(session.enquiries != null ? session.enquiries : "") +
      "&enquiryLenders=" + encodeURIComponent(session.enquiryLenders || "")
    ).catch(e => console.error("persistPartialFields error:", e.message));
  } catch(e) {
    console.error("persistPartialFields error:", e.message);
  }
}

// ============================================================
// TRIGGER CASE SUMMARY — direct, no AI analyzer
// ============================================================
async function triggerCaseSummary(session, from) {
  try {
    console.log("Sending case brief for: " + from);

    const briefText =
      "CASE BRIEF\n" +
      "Name: " + (session.name || "-") + "\n" +
      "Age: " + (session.customerAge || "-") + "\n" +
      "Employment: " + (session.employmentType || "-") + "\n" +
      (session.employmentType === "Self-Employed" ? "GST Registered: " + (session.gstDate || "-") + "\n" : "") +
      (session.employmentType === "Self-Employed" ? "Company Type: " + (session.companyType || "-") + "\n" : "") +
      "City / Pincode: " + (session.city || "-") + " / " + (session.pincode || "-") + "\n" +
      "CIBIL: " + (session.cibilScore || "-") + "\n" +
      "Loan Type: " + (session.loanType || "-") + "\n" +
      "Loan Amount: " + (session.loanAmount || "-") + "\n" +
      (session.propertyDetails ? "Property Details: " + session.propertyDetails + "\n" : "") +
      "Bounces (6 mo): " + (session.bounces != null ? session.bounces : "-") + "\n" +
      (session.bounces > 0 ? "Bounce Cleared: " + (session.bounceCleared || "-") + "\n" : "") +
      (session.bounces > 0 ? "Bounce Loan Type: " + (session.bounceLoanType || "-") + "\n" : "") +
      "Enquiries (3 mo): " + (session.enquiries != null ? session.enquiries : "-") +
      (session.enquiryLenders ? " (" + session.enquiryLenders + ")" : "") +
      (checkManualReview(session) ? "\n⚠️ MANUAL REVIEW: " + checkManualReview(session) : "");

    const payload = {
      action         : "case-summary",
      mobile         : from,
      name           : session.name           || "",
      age            : session.customerAge    || "",
      employmentType : session.employmentType || "",
      gstDate        : session.gstDate        || "",
      companyType    : session.companyType    || "",
      propertyDetails: session.propertyDetails || "",
      loanType       : session.loanType       || "",
      loanAmount     : session.loanAmount     || "",
      city           : session.city           || "",
      pincode        : session.pincode        || "",
      cibilScore     : session.cibilScore     || "",
      bounces        : session.bounces        != null ? session.bounces : "",
      enquiries      : session.enquiries      != null ? session.enquiries : "",
      enquiryLenders : session.enquiryLenders || "",
      specialistName : session.specialistName || "",
      partnerCode    : session.partnerCode    || "",
      isPartnerCase  : session.partnerMode    || false,
      caseBrief      : briefText
    };

    // Save all lead data directly — no AI analyzer step
    fetch(process.env.APPS_SCRIPT_URL +
      "?action=saveLeadData" +
      "&mobile="            + encodeURIComponent(from) +
      "&partnerMobile="     + encodeURIComponent(session.partnerCode    || "") +
      "&age="               + encodeURIComponent(session.customerAge    || "") +
      "&employmentType="    + encodeURIComponent(session.employmentType || "") +
      "&gstDate="           + encodeURIComponent(session.gstDate        || "") +
      "&companyType="       + encodeURIComponent(session.companyType    || "") +
      "&propertyDetails="   + encodeURIComponent(session.propertyDetails || "") +
      "&pincode="           + encodeURIComponent(session.pincode        || "") +
      "&cibilScore="        + encodeURIComponent(session.cibilScore     || "") +
      "&loanAmount="        + encodeURIComponent(session.loanAmount     || "") +
      "&bounces="           + encodeURIComponent(session.bounces != null ? session.bounces : "") +
      "&bounceCleared="     + encodeURIComponent(session.bounceCleared  || "") +
      "&bounceLoanType="    + encodeURIComponent(session.bounceLoanType || "") +
      "&enquiries="         + encodeURIComponent(session.enquiries != null ? session.enquiries : "") +
      "&enquiryLenders="    + encodeURIComponent(session.enquiryLenders || "") +
      "&caseSummary="       + encodeURIComponent(briefText)
    ).catch(e => console.error("saveLeadData error:", e.message));

    // Update broadcast sheet if broadcast lead
    if (session.isBroadcastLead) {
      fetch(process.env.APPS_SCRIPT_URL +
        "?action=updateBroadcastBrief&mobile=" + encodeURIComponent(from)
      ).catch(e => console.error("updateBroadcastBrief error:", e.message));
    }

    console.log("✅ Case brief saved for: " + from);
  } catch(e) {
    console.error("triggerCaseSummary error:", e.message);
  }
}

// ============================================================
// SAVE LEAD TO WA LEADS (status routed through updateWALeadStatus)
// ============================================================
async function saveLeadToSheet(mobile, name, loanType, city, status) {
  try {
    if (!process.env.APPS_SCRIPT_URL) return;
    const url = process.env.APPS_SCRIPT_URL +
      "?action=storeMessage" +
      "&mobile="   + encodeURIComponent(mobile) +
      "&name="     + encodeURIComponent(name     || "") +
      "&loanType=" + encodeURIComponent(loanType || "") +
      "&city="     + encodeURIComponent(city     || "");
    await fetch(url);

    if (status) {
      const statusUrl = process.env.APPS_SCRIPT_URL +
        "?action=updateWALeadStatus" +
        "&mobile=" + encodeURIComponent(mobile) +
        "&status=" + encodeURIComponent(status);
      await fetch(statusUrl).catch(e => console.error("updateWALeadStatus error:", e.message));
    }
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
      "&mobile=" + encodeURIComponent(mobile);
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
// SEND INTERACTIVE BUTTONS — free-form session message, no
// Meta template approval needed (works inside the 24hr window)
// ============================================================
async function sendInteractiveButtons(to, bodyText, buttons) {
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
          type             : "interactive",
          interactive: {
            type: "button",
            body: { text: bodyText },
            action: {
              buttons: buttons.map(function(b) {
                return { type: "reply", reply: { id: b.id, title: b.title } };
              })
            }
          }
        })
      }
    );
    const data = await res.json();
    return data.messages ? true : false;
  } catch(e) {
    console.error("sendInteractiveButtons error:", e.message);
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
// FRESH SESSION OBJECT
// ============================================================
function newSession(overrides) {
  const base = {
    layer          : "priya",
    specialistName : null,
    messages       : [],
    priyaMessages  : [],
    msgCount       : 0,
    name           : null,
    customerAge    : null,
    loanType       : null,
    loanAmount     : null,
    city           : null,
    pincode        : null,
    employmentType : null,
    gstDate        : null,
    companyType    : null,
    propertyDetails: null,
    cibilScore     : null,
    bounces        : null,
    bounceCleared  : null,
    bounceLoanType : null,
    enquiries      : null,
    enquiryLenders : null,
    partnerMode    : false,
    partnerCode    : null,
    caseSummarySent: false,
    rejected       : false,
    awaitingPortalChoice: false,
    altStep        : null,
    altFamilyName  : null,
    altOffered     : null,
    greeting       : getTimeGreeting()
  };
  return Object.assign(base, overrides || {});
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
      await sendTextMessage(from, "Hi! 😊 Please send documents directly to our RM Manoj on his number instead of this chat:\n📱 9594592020\n\nHe'll review them right away!");
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

    await storeInAppsScript(from, text);

    // Check if QR lead (VMWREF prefix)
    if (text.toUpperCase().startsWith("VMWREF:") && !conversations[from]) {
      try {
        var ref     = text.substring(7);
        var parts   = ref.split("|");
        var refName = parts[0] || "";
        var refLoan = parts[1] || "Personal Loan";
        var refCity = parts[2] || "";
        var refCode = parts[3] || "";

        fetch(process.env.APPS_SCRIPT_URL +
          "?action=saveQRLead" +
          "&mobile="         + encodeURIComponent(from) +
          "&name="           + encodeURIComponent(refName) +
          "&loanType="       + encodeURIComponent(refLoan) +
          "&city="           + encodeURIComponent(refCity) +
          "&partnerMobile="  + encodeURIComponent(refCode)
        ).catch(function(){});

        conversations[from] = newSession({
          layer          : "specialist",
          specialistName : getSpecialistName(refLoan),
          name           : refName,
          loanType       : refLoan,
          city           : refCity,
          partnerMode    : true,
          partnerCode    : refCode,
          isQRLead       : true
        });
        console.log("✅ QR Lead loaded: " + from + " | " + refName + " | " + refLoan);
      } catch(e) {
        console.error("QR lead error:", e.message);
      }
    }

    // Check if broadcast lead (GST data) exists
    if (!conversations[from]) {
      try {
        const brRes  = await fetch(process.env.APPS_SCRIPT_URL +
          "?action=getBroadcastLead&mobile=" + encodeURIComponent(from));
        const brData = await brRes.json();
        if (brData.success && brData.lead) {
          const bl = brData.lead;
          conversations[from] = newSession({
            layer           : "specialist",
            specialistName  : "Vikram",
            name            : bl.companyName,
            loanType        : "Business Loan",
            city            : bl.city,
            employmentType  : "Self-Employed",
            gstDate         : bl.gst || null,
            isBroadcastLead : true
          });
          fetch(process.env.APPS_SCRIPT_URL +
            "?action=updateBroadcastReply&mobile=" + encodeURIComponent(from)
          ).catch(function(){});
        }
      } catch(e) { console.error("Broadcast check error:", e.message); }
    }

    // Check if this mobile is a referred family member lead
    if (!conversations[from]) {
      try {
        const refRes  = await fetch(process.env.APPS_SCRIPT_URL +
          "?action=getReferralLead&mobile=" + encodeURIComponent(from));
        const refData = await refRes.json();
        if (refData.success && refData.lead) {
          const rl = refData.lead;
          conversations[from] = newSession({
            layer          : "specialist",
            specialistName : getSpecialistName(rl.loanType),
            name           : rl.name,
            loanType       : rl.loanType,
            city           : rl.city,
            isReferralLead : true
          });
          console.log("✅ Referral (family) lead loaded: " + from + " | " + rl.name);
        }
      } catch(e) { console.error("Referral lead check error:", e.message); }
    }

    if (!conversations[from] && text.toUpperCase().includes("START APPLICATION")) {
      try {
        const plRes  = await fetch(process.env.APPS_SCRIPT_URL +
          "?action=getPartnerLeadByMobile&mobile=" + encodeURIComponent(from));
        const plData = await plRes.json();
        if (plData.success && plData.lead) {
          const pl = plData.lead;
          conversations[from] = newSession({
            layer          : "specialist",
            specialistName : getSpecialistName(pl.loanType),
            name           : pl.customerName,
            loanType       : pl.loanType,
            loanAmount     : pl.loanAmount,
            city           : pl.city,
            partnerMode    : true,
            partnerCode    : pl.partnerMobile,
            isPartnerLead  : true
          });
          console.log("✅ Partner lead loaded: " + from + " | " + pl.loanType);
        }
      } catch(e) {
        console.error("Partner lead check error:", e.message);
      }
    }

    // Initialize session
    if (!conversations[from]) {
      conversations[from] = newSession();
    }

    const session = conversations[from];
    session.msgCount++;

    // ── PORTAL CHOICE RESPONSE ────────────────────────────
    if (session.awaitingPortalChoice) {
      session.awaitingPortalChoice = false;
      const choice = text.toLowerCase();
      const wantsContinue = choice.indexOf("continue") !== -1 || choice.indexOf("✅") !== -1;

      if (wantsContinue) {
        await sendTextMessage(from,
          "Great! 😊 Continue your application here:\nhttps://loan.vastmywealth.com" +
          "\n\nOnce done, our team will review and proceed right away!"
        );
        await saveLeadToSheet(from, session.name, session.loanType, session.city, "Application Started");
        fetch(process.env.APPS_SCRIPT_URL + "?action=portalClick&mobile=" + encodeURIComponent(from)).catch(function(){});
      } else {
        await sendTextMessage(from, "No problem! 😊 Our back office team will connect with you shortly.\n📱 9594592020");
      }
      return;
    }

    // ── ALTERNATIVE PATH (family member / property) ──────
    if (session.altStep === "choice") {
      const altChoice = text.toLowerCase();
      if (altChoice.indexOf("family") !== -1 || altChoice.indexOf("👪") !== -1) {
        session.altStep = "family_name";
        await sendTextMessage(from, "Great! 😊 Please share your family member's full name.");
      } else if (session.altOffered === "family_property" && (altChoice.indexOf("property") !== -1 || altChoice.indexOf("🏠") !== -1)) {
        session.altStep = "property_details";
        await sendTextMessage(from, "Great! 😊 Please share the property location/city and its approximate value.");
      } else {
        session.altStep = null;
        session.rejected = true;
        await sendTextMessage(from, "No problem! 😊 We'll be here whenever you're ready.\nVastMyWealth Advisory");
      }
      return;
    }

    if (session.altStep === "family_name") {
      session.altFamilyName = text.trim();
      session.altStep = "family_mobile";
      await sendTextMessage(from, "Thanks! Please share their WhatsApp mobile number (10 digits).");
      return;
    }

    if (session.altStep === "family_mobile") {
      const digits = text.replace(/\D/g, "").slice(-10);
      if (digits.length !== 10) {
        await sendTextMessage(from, "That doesn't look like a valid 10-digit number — please share it again.");
        return;
      }
      const familyMobile = "91" + digits;
      try {
        const refRes  = await fetch(process.env.APPS_SCRIPT_URL +
          "?action=saveReferralLead" +
          "&type="       + encodeURIComponent("family") +
          "&mobile="     + encodeURIComponent(familyMobile) +
          "&name="       + encodeURIComponent(session.altFamilyName || "") +
          "&loanType="   + encodeURIComponent(session.loanType || "") +
          "&city="       + encodeURIComponent(session.city || "") +
          "&referredBy=" + encodeURIComponent(from));
        const refData = await refRes.json();
        console.log("saveReferralLead (family) result:", JSON.stringify(refData));
      } catch(e) {
        console.error("saveReferralLead error:", e.message);
      }

      await sendTextMessage(from, "Thank you! 😊 We've noted " + (session.altFamilyName || "their") + "'s details.\n\nPlease ask them to message us on this same WhatsApp number to continue, or our team will reach out to them directly!");
      session.altStep = null;
      session.rejected = true;
      return;
    }

    if (session.altStep === "property_details") {
      try {
        const refRes  = await fetch(process.env.APPS_SCRIPT_URL +
          "?action=saveReferralLead" +
          "&type="             + encodeURIComponent("property") +
          "&mobile="           + encodeURIComponent(from) +
          "&name="             + encodeURIComponent(session.name || "") +
          "&loanType="         + encodeURIComponent("Loan Against Property") +
          "&city="             + encodeURIComponent(session.city || "") +
          "&propertyDetails="  + encodeURIComponent(text.trim()) +
          "&cibilScore="       + encodeURIComponent(session.cibilScore || "") +
          "&originalLoanType=" + encodeURIComponent(session.loanType || ""));
        const refData = await refRes.json();
        console.log("saveReferralLead (property) result:", JSON.stringify(refData));
      } catch(e) {
        console.error("saveReferralLead error:", e.message);
      }

      await sendTextMessage(from, "Thank you! 😊 We've noted your property details for a Loan Against Property option.\n\nOur team will personally review this and reach out to discuss further!");
      session.altStep  = null;
      session.rejected = true;
      return;
    }

    // ── CASE ALREADY DONE ────────────────────────────────
    if (session.caseSummarySent) {
      await sendTextMessage(from, "Hi! 😊 Your case is already with our team.\n\nOur back office team will connect with you shortly.\n\nFor any urgent queries feel free to message here!");
      return;
    }

    // ── ALREADY REJECTED ──────────────────────────────────
    if (session.rejected) {
      await sendTextMessage(from, "Hi! 😊 We've already reviewed your profile and shared feedback earlier.\n\nOnce it improves, just message us again — we'll be happy to help! 🙏");
      return;
    }

    // ── PARTNER LOGIN ────────────────────────────────────
    if (text.toUpperCase() === "PARTNER LOGIN") {
      session.layer               = "partner";
      session.partnerMode         = true;
      session.awaitingPartnerMobile = true;
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
          await sendTextMessage(from, "Your registration is under review. Approval team will confirm shortly! We will notify you. 😊");
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
      systemPrompt = getSpecialistPrompt(
        session.specialistName,
        session.loanType,
        session.name,
        session.city,
        session.pincode,
        session.customerAge
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
    currentHistory.push({ role: "assistant", content: JSON.stringify(botResponse) });
    if (currentHistory.length > 20) {
      const keep = currentHistory.slice(-20);
      if (session.layer === "priya") session.priyaMessages = keep;
      else session.messages = keep;
    }

    // Extract data
    if (botResponse.customerName)    session.name           = botResponse.customerName;
    if (botResponse.customerAge)     session.customerAge    = botResponse.customerAge;
    if (botResponse.loanType)        session.loanType       = botResponse.loanType;
    if (botResponse.loanAmount)      session.loanAmount     = botResponse.loanAmount;
    if (botResponse.city)            session.city           = botResponse.city;
    if (botResponse.pincode)         session.pincode        = botResponse.pincode;
    if (botResponse.employmentType)  session.employmentType = botResponse.employmentType;
    if (botResponse.gstDate)         session.gstDate        = botResponse.gstDate;
    if (botResponse.companyType)     session.companyType    = botResponse.companyType;
    if (botResponse.cibilScore)      session.cibilScore     = botResponse.cibilScore;
    if (botResponse.bounces !== undefined && botResponse.bounces !== null) session.bounces = botResponse.bounces;
    if (botResponse.bounceCleared)  session.bounceCleared  = botResponse.bounceCleared;
    if (botResponse.bounceLoanType) session.bounceLoanType = botResponse.bounceLoanType;
    if (botResponse.enquiries !== undefined && botResponse.enquiries !== null) session.enquiries = botResponse.enquiries;
    if (botResponse.enquiryLenders)  session.enquiryLenders = botResponse.enquiryLenders;

    // Save conversation
    saveConversation(from, "customer", text);
    saveConversation(from, "bot", botResponse.message);

    // ── STRICT REJECTION CHECK — as soon as we have enough info ──
    if (session.layer !== "partner") {
      const rejectReason = checkRejection(session);
      if (rejectReason) {
        await sendTextMessage(from, rejectMessageFor(rejectReason));
        await saveLeadToSheet(from, session.name, session.loanType, session.city, "Rejected - " + rejectReasonLabel(rejectReason, session));
        persistPartialFields(session, from);

        if (rejectReason === "age") {
          const altSent = await sendInteractiveButtons(from,
            "Do you have an earning family member who could apply instead?",
            [ { id: "alt_family", title: "👪 Family Member" } ]
          );
          if (altSent) { session.altStep = "choice"; session.altOffered = "family_only"; }
          else session.rejected = true;
        } else if (rejectReason === "cibil_plbl") {
          const altSent = await sendInteractiveButtons(from,
            "Do you have an earning family member who could apply instead, or do you own a property we could use for a Loan Against Property?",
            [
              { id: "alt_family",   title: "👪 Family Member" },
              { id: "alt_property", title: "🏠 Have Property" }
            ]
          );
          if (altSent) { session.altStep = "choice"; session.altOffered = "family_property"; }
          else session.rejected = true;
        } else {
          session.rejected = true;
        }
        return;
      }
    }

    // ── SEND REPLY — fixed closing flow overrides model output when case qualifies ──
    const bounceCount = session.bounces != null ? parseInt(session.bounces) || 0 : null;
    const bounceInfoComplete = bounceCount === 0 || (bounceCount > 0 && session.bounceCleared && session.bounceLoanType);

    const hasMinInfo = session.name && session.loanType && session.city &&
                       session.employmentType && session.cibilScore &&
                       session.loanAmount && session.bounces !== null &&
                       session.enquiries !== null && bounceInfoComplete &&
                       (session.employmentType !== "Self-Employed" || (session.gstDate && session.companyType));

    const willCloseCase = botResponse.sendCaseSummary && !session.caseSummarySent &&
      botResponse.qualificationStatus === "ELIGIBLE" && hasMinInfo;

    if (willCloseCase) {
      const closingMsg =
        (session.name || "") + " your profile looks really promising! 😊\n\n" +
        "Please keep your documents ready:\n" +
        "1️⃣ PAN Card\n" +
        "2️⃣ Aadhar Card\n" +
        "3️⃣ Bank Statement (with password)\n" +
        "4️⃣ 3 months salary slips or 3 years ITR\n" +
        "5️⃣ GST Certificate (if self-employed)\n\n" +
        "Do you want to continue with the application now, or wait for our back office team to connect?";

      const sent = await sendInteractiveButtons(from, closingMsg, [
        { id: "portal_continue", title: "✅ Continue" },
        { id: "portal_wait",     title: "⏳ Wait" }
      ]);
      if (!sent) {
        await sendTextMessage(from, closingMsg + "\n\n📱 Contact: 9594592020");
      }
      session.awaitingPortalChoice = true;
    } else if (botResponse.message) {
      await sendTextMessage(from, botResponse.message);
    }

    // ── PRIYA TRANSFERS TO SPECIALIST ────────────────────
    if (session.layer === "priya" && botResponse.transferToSpecialist && botResponse.specialistName) {

      session.layer          = "specialist";
      session.specialistName = botResponse.specialistName;
      session.messages       = []; // Fresh history for specialist

      if (session.specialistName === "Vikram") session.employmentType = "Self-Employed"; // Business Loan implies self-employed

      console.log("Transferring " + from + " to " + botResponse.specialistName);

      await new Promise(r => setTimeout(r, 2000));

      const specPrompt = getSpecialistPrompt(
        botResponse.specialistName,
        session.loanType,
        session.name,
        session.city,
        session.pincode,
        session.customerAge
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

      await saveLeadToSheet(from, session.name, session.loanType, session.city, "Qualifying");
      return;
    }

    // ── TRIGGER CASE SUMMARY ─────────────────────────────
    if (willCloseCase) {
      session.caseSummarySent = true;
      const manualNote = checkManualReview(session);
      console.log("Case brief ready for: " + from + (manualNote ? " (flagged for manual review)" : ""));
      await saveLeadToSheet(from, session.name, session.loanType, session.city, manualNote ? "Manual Decision" : "Case Ready");
      await triggerCaseSummary(session, from);
    }

    // ── HANDLE DECLINED (specialist explicitly declined mid-flow) ───
    if (botResponse.qualificationStatus === "DECLINED") {
      await saveLeadToSheet(from, session.name, session.loanType, session.city, "Declined");
      persistPartialFields(session, from);
      session.rejected = true;
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
    status : "VastMyWealth Relay — Final Consolidated v2",
    version: "final2",
    time   : new Date().toISOString()
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, function() {
  console.log("🚀 VastMyWealth Relay running on port " + PORT);

