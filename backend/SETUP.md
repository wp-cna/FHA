# FHA forms backend — setup

A Cloudflare Worker that powers the **Contact** form and the **Posting board** (with AI review).
The static site keeps working without it; deploying this turns the forms real.

## What it does
- `POST /contact` → emails the configured board recipients (via Resend).
- `POST /join` → emails the board a **membership request** for human review (residency + dues). No AI — a board member verifies and follows up with payment details.
- `POST /post` → runs the AI reviewer (`../MODERATION.md`), stores every submission in `PENDING`, and emails the board Publish/Reject links. Nothing publishes or sends a rejection until a board member confirms it.

All three are spam-guarded by a hidden honeypot plus hourly sender/IP limits. Posting-board submissions also get minimum-substance validation and 24-hour exact-duplicate suppression before the AI is called.

## Step 0 — Grab three API keys (browser, unavoidable)
Each provider has a free tier. Sign in to Resend/Anthropic with the **fha.wp.info@gmail.com** account and GitHub with **wp-cna**. You only copy a key from each — everything else is terminal.

| Key | Where | Notes |
|-----|-------|-------|
| `RESEND_API_KEY` | resend.com → API Keys → Create | Multiple board recipients and submitter-rejection emails require the configured `mail.wp-cna.org` sending domain to be verified before deployment (see bottom). |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Powers the posting-board reviewer. |
| `GITHUB_TOKEN` | github.com → Settings → Developer settings → **Fine-grained tokens** | Repo access: **wp-cna/FHA** only. Permission: **Contents → Read and write**. Lets approved posts commit to `data/posts.json`. |

> Terminal-only alternative for the GitHub token: `gh auth login` then `gh auth token` gives a working token immediately — broader scope than a fine-grained PAT, but fine if you'd rather not touch the web UI.

## Step 1 — Deploy the Worker (all terminal)
```bash
npm install -g wrangler
cd backend
wrangler login                              # opens a browser tab once to authorize Cloudflare

# RATE_LIMIT and PENDING are already provisioned and bound in wrangler.toml.
# Create replacements only when moving the Worker to a different Cloudflare account.

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

## Step 3 — Point the site at the Worker
```bash
cd ..                                       # repo root
# set API_BASE to your Worker URL (one line in forms.js)
sed -i '' 's#var API_BASE = "";#var API_BASE = "'"$W"'";#' forms.js
git add forms.js && git commit -m "Wire forms to the deployed Worker" && git push
```
(If you push from never-nude rather than wp-cna, hand `forms.js` to Codex instead.) Once it ships, the live Contact / Join / Posting-board forms are real.

## Notes
- **Sending domain (later):** to send *from* a real FHA address and to deliver rejection emails to arbitrary submitters, verify a domain in Resend and set `MAIL_FROM` in `wrangler.toml`, then `wrangler deploy`. Until then the board emails (to your own address) work in test mode.
- **Model:** the reviewer uses `claude-haiku-4-5-20251001` (cheap/fast). Swap `MODEL` in `worker.js` for a stronger one if desired.
- **Config** (non-secret) lives in `wrangler.toml`: allowed origin, board email, from address, repo.
- **Re-deploy** after any `worker.js` or `wrangler.toml` change: `wrangler deploy`.
