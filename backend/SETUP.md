# FHA forms backend — setup

A Cloudflare Worker that powers the **Contact**, **Membership**, and **Posting board** forms.
Deploy the Worker before publishing matching static-form changes.

## What it does
- `POST /contact` → emails the configured board recipients (via Resend).
- `POST /join` → emails the board a **membership request** for human review (residency + dues). No AI — a board member verifies and follows up with payment details.
- `POST /post` → runs the AI reviewer (`../MODERATION.md`), stores every submission in a per-token SQLite-backed Durable Object, and emails the board Publish/Reject confirmation links. Nothing publishes or sends a rejection until a board member confirms it.

All three enforce a 16 KiB streaming body cap, strict schemas, a hidden honeypot, and Cloudflare Rate Limiting bindings (20/IP/minute before body parsing and 5/validated email/minute). Missing rate-limit bindings fail closed. Posting-board submissions also get minimum-substance validation and 24-hour exact-duplicate suppression before the AI is called.

The HTML forms have real POST actions for no-JavaScript delivery. Native submissions receive a minimal Worker-hosted HTML result page; JavaScript submissions keep JSON+CORS responses. During rollout, `forms.js` sends both `publicContact` and legacy `phone` so the older Worker still receives the consented contact for board review. Only the updated Worker persists it into a published post, which is why the Worker must deploy first.

## Step 0 — Grab three API keys (browser, unavoidable)
Each provider has a free tier. Sign in to Resend/Anthropic with the **fha.wp.info@gmail.com** account and GitHub with **wp-cna**. You only copy a key from each — everything else is terminal.

| Key | Where | Notes |
|-----|-------|-------|
| `RESEND_API_KEY` | resend.com → API Keys → Create | Multiple board recipients and submitter notifications require the dedicated `mail.wp-cna.org` subdomain to show **Verified** in the FHA Resend account before deployment. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Powers the posting-board reviewer. |
| `GITHUB_TOKEN` | github.com → Settings → Developer settings → **Fine-grained tokens** | Repo access: **wp-cna/FHA** only. Permission: **Contents → Read and write**. Lets approved posts commit to `data/posts.json`. |

> Terminal-only alternative for the GitHub token: `gh auth login` then `gh auth token` gives a working token immediately — broader scope than a fine-grained PAT, but fine if you'd rather not touch the web UI.

## Step 1 — Deploy the Worker (all terminal)
```bash
npm install -g wrangler
cd backend
wrangler login                              # opens a browser tab once to authorize Cloudflare

# RATE_LIMIT (dedupe) and PENDING (legacy moderation links) are already bound.
# Native rate limiters and MODERATION_ACTIONS are declared in wrangler.toml.

# paste each key when prompted (input is hidden)
wrangler secret put RESEND_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GITHUB_TOKEN

wrangler deploy                             # prints your Worker URL
```
Copy the URL it prints, e.g. `https://fha-forms.<subdomain>.workers.dev`.

## Step 2 — Smoke-test from the terminal
Replace `$W` with your Worker URL. The board should get an email for the first two.
```bash
W=https://fha-forms.<subdomain>.workers.dev

# contact form
curl -sX POST $W/contact -H 'content-type: application/json' \
  -d '{"name":"Test","email":"you@example.com","subject":"Hi","message":"Testing contact."}'

# membership request
curl -sX POST $W/join -H 'content-type: application/json' \
  -d '{"name":"Test","email":"you@example.com","residency":"current","address":"1 Fisher Hill","membership":"individual"}'

# board post (runs the AI reviewer and emails the board; it remains pending)
curl -sX POST $W/post -H 'content-type: application/json' \
  -d '{"name":"Test","email":"you@example.com","postType":"Local business or service","title":"Joe'\''s Bakery","message":"New bakery open on Mitchell Place — come say hi."}'
```
Each returns `{"ok":true}`. Watch it live with `wrangler tail` in another terminal.

> A passing `/post` test creates a real pending item and emails the board. Open the Reject link and confirm it after testing; do not press Publish unless the post is intentionally real.

## Step 3 — Confirm the site points at the Worker

The checked-in site already points `forms.js` and all three HTML form `action` attributes at `https://fha-forms.fisher-hill.workers.dev`. If `wrangler deploy` prints that URL, no source edit is needed. If the deployed URL differs, update `API_BASE` in `forms.js` and the `action` attributes in `contact.html`, `join.html`, and `posts.html` to the same origin before publishing the site.

Each new moderation payload is initialized in its Durable Object before the board email is sent. The confirmation POST atomically claims Publish or Reject there before external I/O. `PENDING` is read only to migrate action links issued by the older Worker.

## Notes
- **Sending domain (deployment gate):** `MAIL_FROM` uses `notifications@mail.wp-cna.org`. Add the FHA Resend account's three generated DNS records to that exact subdomain and wait for **Verified** before deploying. Do not reuse the root `wp-cna.org` records: they belong to the separate WPCNA Resend account and its DKIM value conflicts with FHA's.
- **Model:** the reviewer uses `claude-haiku-4-5-20251001` (cheap/fast). Swap `MODEL` in `worker.js` for a stronger one if desired.
- **Config** (non-secret) lives in `wrangler.toml`: allowed origin, board email, from address, repo.
- **Re-deploy** after any `worker.js` or `wrangler.toml` change: `wrangler deploy`.
