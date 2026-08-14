# Fisher Hill Posting Board — AI Review Agent

Design spec for the agent that reviews neighbor submissions before they appear on the Neighborhood Posts page.

---

## 1. What the board is for

A friendly **neighborly classifieds / bulletin board**. The whole point is to help:

- **local businesses and services** get known,
- neighbors post **lost & found pets** (and items),
- people announce **tag sales, yard sales, and giveaways**,
- and share everyday **needs, offers, and recommendations**.

This is deliberately **broader than the WPCNA board**, which *excludes* advertising and yard sales. Here those are exactly what we want.

### Posture: permissive, but no spam
> **When in doubt, publish.** The board should feel open. The agent is a light filter, not a gatekeeper.

The two things it actually guards against:
1. **Spam** — bulk, repeated, automated, or bot submissions. This is the main job.
2. **Clear, serious violations** — personal attacks, harassment/threats/defamation, scams, doxxing.

Everything else leans toward **approve**, and genuine gray areas go to a **human**, not to auto-reject.

---

## 2. Pipeline

The site is static; the board is `data/posts.json` → rendered by `feeds.js`. So:

```
Resident submits the form on posts.html
        │  (POST — native form or JavaScript; 16 KiB cap + validation)
        ▼
Review endpoint (serverless function / Cloudflare Worker)
        │  native IP/email rate-limit bindings → AI review (LLM)
        ▼
Store every result in its per-token SQLite-backed Durable Object
        │  (PENDING KV is only a legacy-token fallback)
        │
        ▼
Email the board the original post + AI recommendation + action links
        │
        ├── First atomic claim: Publish ─▶ append to data/posts.json ─▶ Pages redeploys
        └── First atomic claim: Reject  ─▶ send the submitter a polite note
```

The AI is advisory. Nothing publishes or sends a rejection until a board member confirms the action. Published posts are new objects appended to the same `posts.json` the feed already reads.

---

## 3. Anti-spam (the primary gate)

Layered, cheapest first — most spam never reaches the AI:

1. **Honeypot** — the form has a hidden `fh_check` field (`.hp`). Humans can't see it; bots fill it. A submission with it filled is NOT dropped (browser autofill and password managers fill hidden fields too, which silently ate real neighbors' submissions until 2026-08-14): it goes through the normal flow with a `[SUSPECT]` tag on the board email, and a human decides. The field was renamed from `website` — a name autofill heuristics match — to a name they don't.
2. **Rate limit** — Cloudflare's Rate Limiting bindings cap submissions at 5 per validated email and 20 per IP each minute. Missing or unavailable bindings fail closed before upstream APIs are called.
3. **Dedupe** — suppress an exact repeated post from the same sender for 24 hours. Similar-but-not-identical posts still proceed to human review so this remains permissive.
4. **Minimum substance** — require a real title + body; reject empty/link-only posts.
5. **AI spam check** — the agent flags promotional bulk blasts, link farms, off-area solicitation, and bot-pattern text as `REJECT` with `failedCriteria: ["spam"]`.

Note the line: **one genuine local business posting once = welcome.** The *same* post blasted repeatedly, or a bot dumping links = spam. The difference is volume/pattern, not the fact that it's promotional.

---

## 4. Review rubric

**Welcome (publish):**
| Type | Notes |
|---|---|
| Local business / service / shop | The point of the board. Pricing and promotion are fine here. |
| Lost & found (pet or item) | Approve readily; these are time-sensitive. |
| Tag sale / yard sale / giveaway | Welcome (unlike WPCNA). |
| Neighbor need, offer, recommendation | Broad reading of "neighborly." |
| Civil + truthful + own contact info | Lenient — see §6. |

**Not allowed (reject / escalate):**
| Rule | Difficulty | Action |
|---|---|---|
| Spam (bulk/repeat/bot/automated) | Easy–Medium | **Reject.** Primary gate (§3). |
| Scam or fraudulent offer | Medium | Reject (escalate if unsure). |
| Names/targets/disparages an individual | Medium | Reject (escalate if it's a public official in a civic context). |
| Harassing, threatening, defamatory | Medium | Reject. |
| Airs a personal dispute | Medium | Reject; distinguish from a safety heads-up (escalate if unsure). |
| Shares a third party's private info | Easy | Strip-and-approve minor cases; reject doxxing. |
| Unrelated to Fisher Hill / White Plains | Easy | Reject off-area; give topical benefit of the doubt. |

---

## 5. Decision model

1. **APPROVE** — publish as submitted.
2. **APPROVE_WITH_EDITS** — publish after a minimal, described edit (strip a third party's number, trim a slur). Returns cleaned text; meaning unchanged.
3. **ESCALATE** — a real but ambiguous serious case → board member, not auto-rejected.
4. **REJECT** — spam or an unambiguous violation; always returns a plain reason.

Defaults: unsure between APPROVE and ESCALATE → **APPROVE**; between ESCALATE and REJECT → **ESCALATE**. Spam is the exception — reject it outright.

---

## 6. Agent system prompt (drop-in)

```
You review submissions to the Fisher Hill Association neighborhood board before they are
published. The board is a friendly neighborly classifieds board: its PURPOSE is to help
local businesses get known, and to let neighbors post lost-and-found pets, tag sales,
giveaways, needs, offers, and recommendations.

Your posture is PERMISSIVE: when in doubt, publish. The board should feel open. You are a
light filter, not a gatekeeper. Promotion, prices, and yard sales are WELCOME — do not
reject a post just because it advertises a local business or sale.

The two things you guard against:
1. SPAM — bulk, repeated, automated, bot, or link-farm submissions, or off-area
   solicitation. Reject these.
2. Clear, serious violations — naming/attacking a specific person; harassing, threatening,
   or defamatory language; scams; or sharing a third party's private info. Reject the clear
   cases; ESCALATE the ambiguous ones to a human.

Be lenient on tone (only clearly abusive language fails), relevance, and writing quality.
Prefer fixing over rejecting: if a small edit makes a post publishable (remove a third
party's phone number, trim a slur), choose APPROVE_WITH_EDITS and return cleaned text.
You cannot verify facts — never reject on suspicion alone; ESCALATE instead.

Return ONLY the JSON described, no prose.
```

## 7. Structured output

```json
{
  "decision": "APPROVE | APPROVE_WITH_EDITS | ESCALATE | REJECT",
  "reason": "One plain-language sentence (shown to submitter on reject, to board on escalate).",
  "failedCriteria": ["spam"],
  "editedTitle": "…or null",
  "editedBody": "…cleaned text, or null",
  "confidence": 0.0
}
```

The endpoint validates this object, then stores the submission and recommendation in the token's Durable Object. The board email shows the recommendation, but the same human confirmation step applies to APPROVE, APPROVE_WITH_EDITS, ESCALATE, and REJECT.

---

## 8. The hard call

- **"Civil and respectful tone."** Subjective. Given the permissive posture, the bar is *clearly abusive/cruel*, not *unfriendly*. Borderline → approve. Avoids the "I was just being honest" dispute.

(Posts are text-only — there's no image upload — so fake/AI image detection isn't a concern here.)

---

## 9. Implementation options

- **Endpoint:** the Worker enforces a streaming body cap, strict schemas, honeypot/rate-limit/dedupe and substance checks, asks the LLM for a recommendation, and stores every result in a per-token Durable Object. Native HTML forms and the JavaScript enhancement use the same endpoints.
- **Publishing:** only the confirmation-page POST behind the board's Publish link uses the **GitHub API** to append an item to `data/posts.json` on `wp-cna/FHA` and commit it (Pages redeploys automatically).
- **Atomic action:** opening a link is read-only. Its confirmation POST persists the first Publish or Reject claim in the token's SQLite-backed Durable Object before any GitHub or email call. Later or conflicting confirmations cannot repeat the side effect. Failed automation remains claimed for manual follow-up.
- **Notifications:** **fha.wp.info@gmail.com**, **michael@mdalton.com**, and **michael.kushman@gmail.com** get every submission with confirmation links. A confirmed rejection sends the submitter the reason using the same Resend path as the contact form.
- **Audit:** pending payloads and claims live in per-token Durable Objects for up to 14 days; `PENDING` KV supports links issued by the pre-Durable-Object Worker only. GitHub records publications, and structured Worker logs record failures without submission content or credentials.

### Rollout order

Deploy the Worker before publishing the static pages so native form POSTs can receive the Worker's HTML response and approved posts can persist the new public-contact field. During a staggered rollout, `forms.js` sends the consented contact as both `publicContact` and legacy `phone`; the old Worker can include it in the board review email, but only the updated Worker writes it into a published post. Without JavaScript, browsers navigate cross-origin to the Worker and receive a minimal response page; no form uses GET and no submitted values are reflected into that page or a URL.
