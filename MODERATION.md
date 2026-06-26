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
        │  (POST — honeypot + rate-limit checked first)
        ▼
Review endpoint (serverless function / Cloudflare Worker)
        │  cheap anti-spam pre-checks  →  AI review (LLM)
        ▼
   ┌── APPROVE / APPROVE-WITH-EDITS ─▶ append item to data/posts.json (GitHub API) ─▶ Pages redeploys ─▶ post appears
   ├── ESCALATE ─▶ board member gets a one-click approve / decline
   └── REJECT  ─▶ submitter gets the reason
```

Approved posts are just new objects appended to the same `posts.json` the feed already reads.

---

## 3. Anti-spam (the primary gate)

Layered, cheapest first — most spam never reaches the AI:

1. **Honeypot** — the form has a hidden `website` field (`.hp`). Humans can't see it; bots fill it. Any submission with it filled is silently dropped. (Already in `posts.html`.)
2. **Rate limit** — cap submissions per email + per IP (e.g., 3/day, 1/minute). Block obvious floods.
3. **Dedupe** — reject near-identical text from the same sender within a window.
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

Endpoint acts on `decision`: APPROVE/APPROVE_WITH_EDITS → append `{title, category, summary, date, source, …}` to `data/posts.json` and commit; ESCALATE → notify board; REJECT → notify submitter.

---

## 8. The hard call

- **"Civil and respectful tone."** Subjective. Given the permissive posture, the bar is *clearly abusive/cruel*, not *unfriendly*. Borderline → approve. Avoids the "I was just being honest" dispute.

(Posts are text-only — there's no image upload — so fake/AI image detection isn't a concern here.)

---

## 9. Implementation options

- **Endpoint:** a Cloudflare Worker or small serverless function. Runs honeypot/rate-limit/dedupe, then the LLM review, then uses the **GitHub API** to append approved items to `data/posts.json` on `wp-cna/FHA` and commit (Pages redeploys automatically).
- **Notifications:** the FHA board address **fha.wp.info@gmail.com** gets ESCALATE items (with approve/decline links); the submitter gets the reason on REJECT — same email path as the contact form.
- **Audit:** log every submission + decision so the board can spot-check and tune the spam threshold over time.
