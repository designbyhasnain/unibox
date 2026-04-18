# Jarvis Training Plan — Make AI Reply Like Your Best Sales Rep

## The Problem

Jarvis currently uses:
- **llama-3.1-8b** (smallest/dumbest model) for replies
- **Zero business knowledge** — no pricing, packages, turnaround times
- **No examples** of your actual winning replies
- **Minimal contact context** — doesn't know their region, past projects, spend history
- **Result:** Generic, useless replies that don't know what to say

## The Solution: 3-Layer Knowledge System

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: LIVE CONTEXT (per reply)                      │
│  Contact's region, pipeline stage, past projects,       │
│  revenue, email count, how they found you               │
├─────────────────────────────────────────────────────────┤
│  LAYER 2: WINNING PATTERNS (mined from your data)       │
│  304 closed deals → extract Q&A pairs, pricing,         │
│  objection handling, what worked vs what didn't          │
├─────────────────────────────────────────────────────────┤
│  LAYER 1: BUSINESS PLAYBOOK (static knowledge)          │
│  Services, pricing by region, turnaround times,         │
│  payment methods, pitch style, tone rules               │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Business Playbook (Static Knowledge)

### What to Build

A single document (`src/knowledge/playbook.ts`) exported as a string constant that gets injected into every reply prompt. Contains:

```
1. WHO WE ARE
   - Wedits / Films by Rafay — wedding video editing & post-production
   - Based in Pakistan, serving videographers in US, UK, EU, Australia
   - 1,117 projects completed, $367K+ revenue

2. SERVICES & PRICING (by region)
   ┌──────────────────────┬────────┬────────┬────────┐
   │ Service              │ US/UK  │ EU     │ AUS    │
   ├──────────────────────┼────────┼────────┼────────┤
   │ 4-min cinematic      │ $XXX   │ $XXX   │ $XXX   │
   │ Full-length film     │ $XXX   │ $XXX   │ $XXX   │
   │ Recap + full         │ $XXX   │ $XXX   │ $XXX   │
   │ Social media clips   │ $XXX   │ $XXX   │ $XXX   │
   │ Destination wedding  │ $XXX   │ $XXX   │ $XXX   │
   └──────────────────────┴────────┴────────┴────────┘
   (You fill these in — or we mine them from emails)

3. TURNAROUND TIMES
   - Standard: 15-20 business days
   - Rush: 7-10 days (+ rush fee)
   - Test film: 5-7 days (free first edit)

4. PAYMENT METHODS
   - Zelle, ACH, Stripe payment link
   - 50% upfront, 50% on delivery (for new clients)
   - Net 15 for repeat clients

5. THE PITCH FORMULA (from your winning emails)
   - Always offer a FREE test film first
   - Lead with compliment about their work
   - Show portfolio links that match their style
   - Keep it casual — "Hey", "bro", "man"
   - Never hard-sell — "no strings attached"

6. OBJECTION HANDLING
   - "Too expensive" → offer smaller package, show ROI
   - "Already have an editor" → "Happy to do a test film, no commitment"
   - "Not sure about quality" → send portfolio + offer free edit
   - "No work right now" → "No worries, I'll be here when busy season hits"
   - "How do I send footage?" → "Dropbox or Google Drive, share the link"

7. TONE RULES
   - Casual but professional
   - Short sentences, 2-5 per reply
   - Use their name
   - Mirror their formality level
   - Never: "I hope this email finds you well"
   - Always: specific, concrete, actionable
```

### How to Populate

**Option A (Fast):** You dictate it to me — tell me pricing, I write the doc.

**Option B (Data-mined):** I scan your 304 closed deals and extract:
- Every time you mentioned a price → build pricing table
- Every time you handled an objection → build objection playbook
- Every first reply that led to a close → extract pitch pattern

---

## Layer 2: Winning Patterns (Mined From Your Data)

### The Knowledge Extraction Pipeline

```
STEP 1: Extract all conversations from 304 CLOSED deals
        ↓
STEP 2: Classify each email exchange into categories:
        - PRICING_QUESTION → your price reply
        - OBJECTION → your handling
        - LOGISTICS → turnaround, delivery, payment
        - NEGOTIATION → discount, package adjustment
        - CLOSING → the message that sealed the deal
        - ONBOARDING → file transfer, project details
        ↓
STEP 3: Score each pattern by success rate:
        - This pricing reply → 80% led to next step
        - This objection handling → 60% led to close
        - This cold pitch → 35% reply rate
        ↓
STEP 4: Store as structured Q&A pairs in database
        ↓
STEP 5: On each reply, find the 3 most relevant Q&A pairs
         and inject them as few-shot examples
```

### Database Schema for Knowledge Base

```sql
CREATE TABLE jarvis_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,        -- 'PRICING', 'OBJECTION', 'LOGISTICS', etc.
    client_question TEXT NOT NULL,  -- what the client asked
    our_reply TEXT NOT NULL,        -- what we replied
    outcome TEXT NOT NULL,          -- 'CLOSED', 'CONTINUED', 'LOST'
    contact_region TEXT,            -- 'US', 'EU', 'UK', 'AUS'
    service_type TEXT,              -- '4min_recap', 'full_length', etc.
    price_mentioned DECIMAL,       -- if pricing was discussed
    success_score FLOAT,           -- 0.0 to 1.0 based on outcome
    source_contact_id UUID,        -- which deal this came from
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast retrieval
CREATE INDEX idx_knowledge_category ON jarvis_knowledge(category, success_score DESC);
```

### What Gets Extracted (Examples from Your Real Data)

**From Modern Sync deal (171 emails, CLOSED):**

| Category | Client Said | You Replied | Outcome |
|----------|------------|-------------|---------|
| PRICING | "How much would you charge for a mitzvah cinematic recap and a full length video?" | "For a mitzvah cinematic recap and a full-length video, I would charge around $500." | CLOSED |
| LOGISTICS | "What would the turnaround time be if I was to send you footage tonight?" | "The turnaround time would be around 15-20 days. But let me know if there's a deadline!" | CONTINUED |
| PAYMENT | Client confirmed Zelle | "Sure brother, Here's my Zelle: [number]" | CLOSED |
| UPSELL | "I have another mitzvah that I would love your help with" | "I'd definitely love to do another one! If you can send over the footage link, that'd be great." | CLOSED |

**From Maria Hudye deal (16 emails, CLOSED):**

| Category | Client Said | You Replied | Outcome |
|----------|------------|-------------|---------|
| INTEREST | "You're willing to do a free film to start? I'd love this." | "Yes, I offer a free test film so that you can have a better idea moving forward with me." | CONTINUED |
| LOGISTICS | "What platform do you prefer for getting the footage?" | "You can upload the footage to Dropbox and share the link with me, Google Drive also works." | CLOSED |

### Extraction Script Plan

```
Script: scripts/extract-jarvis-knowledge.ts

1. Fetch all 304 CLOSED contacts
2. For each contact, fetch their full email thread (ordered by date)
3. For each RECEIVED email, use LLM to classify:
   - Is this a pricing question? → extract price asked + our reply
   - Is this an objection? → extract objection + our handling
   - Is this a logistics question? → extract question + answer
   - Is this a negotiation? → extract what was negotiated
4. Store classified Q&A pairs in jarvis_knowledge table
5. Calculate success_score based on:
   - Did this contact reach CLOSED? → 1.0
   - Did they reach OFFER_ACCEPTED? → 0.8
   - Did they stay as LEAD? → 0.4
   - Did they go NOT_INTERESTED? → 0.0

Expected output: ~500-1000 Q&A pairs from 304 deals
```

### Also Extract from FAILED deals (Learning what NOT to do)

```
Compare CLOSED vs LEAD (replied but didn't close):
- 304 CLOSED deals → what did we say that worked?
- 1,835 LEAD contacts → what did we say that DIDN'T work?
- Find the patterns that differentiate closers from non-closers
```

---

## Layer 3: Live Contact Context (Per Reply)

### What to Inject Into Every Reply Prompt

Currently Jarvis only gets: name, email, company, pipeline_stage.

**Upgrade to include:**

```typescript
// Contact enrichment for reply context
{
    name: "Carlos",
    email: "modernsyncmedia@gmail.com",
    company: "Modern Sync Media",
    pipeline_stage: "CLOSED",           // already have
    region: "US",                       // from location/TLD
    contact_type: "CLIENT",             // LEAD or CLIENT
    total_emails: 171,                  // conversation depth
    total_projects: 3,                  // past work together
    total_revenue: "$1,500",            // lifetime value
    avg_project_value: "$500",          // avg spend
    first_contact_date: "2024-05-31",   // how long we've known them
    last_email_date: "2025-06-02",      // recency
    services_used: ["cinematic recap", "full length"],
    payment_method: "Zelle",            // how they pay
    turnaround_preference: "15-20 days",
    referral_source: "Upwork",          // how they found us
    notes: "Repeat client, does mitzvahs"
}
```

This context lets Jarvis tailor replies:
- New prospect → pitch mode (offer free test)
- Repeat client → casual, skip the pitch
- High-value client → premium service, faster turnaround
- EU client → different pricing tier
- Client who asked about pricing before → reference past quote

---

## Execution Plan

### Phase 1: Quick Wins (Day 1) — Immediate Impact

| # | Change | File | Impact |
|---|--------|------|--------|
| 1 | **Upgrade model** to `llama-3.3-70b-versatile` | `replySuggestionService.ts` line 48 | Much smarter replies |
| 2 | **Increase max tokens** from 350 → 800 | `replySuggestionService.ts` line 50 | Longer, more detailed replies |
| 3 | **Lower temperature** from 0.6 → 0.4 | `replySuggestionService.ts` line 51 | More consistent, less random |
| 4 | **Inject basic playbook** into system prompt | `replySuggestionService.ts` line 32 | Knows pricing/services |
| 5 | **Pass richer contact context** | `jarvisActions.ts` line 69-83 | Personalized replies |

### Phase 2: Knowledge Mining (Day 2-3)

| # | Task | Output |
|---|------|--------|
| 6 | Create `jarvis_knowledge` table in Supabase | Schema for Q&A pairs |
| 7 | Build extraction script | Scans 304 closed deals |
| 8 | Run extraction → populate knowledge base | ~500-1000 Q&A pairs |
| 9 | Build retrieval function | Find relevant examples per reply |
| 10 | Inject top 3 matching examples into prompt | Few-shot learning |

### Phase 3: Success Pattern Analysis (Day 4)

| # | Task | Output |
|---|------|--------|
| 11 | Compare CLOSED vs LEAD reply patterns | What works vs what doesn't |
| 12 | Extract pricing data from all deals | Pricing table by region/service |
| 13 | Build objection handling playbook | Top 10 objections + best responses |
| 14 | Identify "closing phrases" | What you say that seals deals |

### Phase 4: Continuous Learning (Ongoing)

| # | Feature | How |
|---|---------|-----|
| 15 | **Feedback loop** — user clicks "Use this reply" vs "Regenerate" | Track which suggestions are accepted |
| 16 | **Auto-learn from sent replies** — when user sends, compare to Jarvis suggestion | Learn from corrections |
| 17 | **Outcome tracking** — did this reply lead to a close? | Update success_score |
| 18 | **A/B test reply styles** — generate 2 variants, track which gets replies | Data-driven optimization |

---

## The Upgraded Reply Prompt (Phase 1)

```
You are Jarvis — the sales brain for Wedits, a wedding video editing agency.
You draft replies that close deals.

## YOUR BUSINESS
- Wedits edits wedding films for videographers worldwide
- 1,117+ projects completed, $367K+ revenue
- Free test film for new prospects (your #1 closer)
- Services: cinematic recaps (4-min), full-length films, social clips, highlight reels
- Turnaround: 15-20 days standard, 7-10 rush
- Payment: Zelle, ACH, Stripe | 50/50 for new clients

## PRICING GUIDE
[Injected from playbook — pricing by region/service]

## THIS CONTACT
Name: {name} | Company: {company} | Region: {region}
Stage: {pipeline_stage} | Emails: {total_emails} | Projects: {total_projects}
Revenue: {total_revenue} | Last contact: {last_email_date}

## SIMILAR SUCCESSFUL REPLIES
[3 Q&A pairs from jarvis_knowledge that match the current situation]

Example 1: Client asked "{question}" → You replied: "{reply}" → Result: CLOSED
Example 2: ...
Example 3: ...

## RULES
- Draft the reply body ONLY. No subject, no signature, no "Here's a draft:".
- 2-5 sentences. Match the prospect's tone.
- If they ask about pricing → give specific numbers from the pricing guide.
- If they're a new prospect → offer a free test film.
- If they're a repeat client → be casual, reference past work.
- If they have an objection → handle it using the playbook patterns.
- Always propose a concrete next step.
- Plain text only. No HTML, no emoji unless they used them.
- Write like Rafay — casual, warm, "bro"/"man" for regulars, direct.
```

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Reply suggestion acceptance rate | ~10% (estimated) | ~60%+ |
| Time to compose reply | 3-5 min manual | 5 sec + quick edit |
| Pricing accuracy | 0% (told not to mention) | 95% (from playbook) |
| Personalization | Generic | Region/history-aware |
| Tone match | Robotic | Matches Rafay's voice |
| Objection handling | None | Data-backed patterns |

---

## Data Available for Mining

| Source | Records | Contains |
|--------|---------|----------|
| CLOSED deals | 304 contacts | Full conversations that led to sales |
| OFFER_ACCEPTED | 23 contacts | Almost-closed conversations |
| LEAD (replied) | 1,835 contacts | Conversations that stalled (learn what failed) |
| Rich threads (8+ emails) | 50+ closed deals | Deep pricing/negotiation exchanges |
| Total email archive | 109K+ emails | Complete communication history |

### Richest Training Threads

| Contact | Emails | Company | Value |
|---------|--------|---------|-------|
| Modern Sync | 171 | Modern Sync Media | Repeat client, mitzvah + wedding |
| The Saint Weddings | 92 | The Saint Weddings | High volume |
| Cam Harbertson | 72 | - | Deep relationship |
| Kalli Obray | 60 | - | Long conversation |
| Amanda Sanchez | 54 | Amandasanchez Films | Active client |
| Liz Crookes | 37 | Crookes Media | UK market |
| Carlos dos Santos | 33 | CK Creation | EU market |

---

## What I Need From You

Before executing, I need you to confirm or provide:

1. **Pricing table** — fill in actual prices per region/service, OR say "mine it from emails"
2. **Top 3 objections** you hear most often
3. **Your "closing move"** — what do you typically say that seals the deal?
4. **Any topics Jarvis should NEVER discuss** (e.g., specific competitors, internal issues)
5. **Tone preference** — should Jarvis be more casual or more professional than current?

Or simply say **"mine everything from emails"** and I'll extract it all from your 304 closed deals.
