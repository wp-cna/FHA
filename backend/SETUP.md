# FHA forms backend — setup

A Cloudflare Worker that powers the **Contact** form and the **Posting board** (with AI review).
The static site keeps working without it; deploying this turns the forms real.

## What it does
- `POST /contact` → emails the board at **fha.wp.info@gmail.com** (via Resend).
- `POST /join` → emails the board a **membership request** for human review (residency + dues). No AI — a board member verifies and follows up with payment details.
- `POST /post` → runs the AI reviewer (`../MODERATION.md`), then publishes approved posts to `data/posts.json`, emails the board for escalations, or emails the submitter on rejection.

All three are spam-guarded: a hidden honeypot field and (optional) per-sender rate limiting.

## Step 0 — Grab three API keys (browser, unavoidable)
Each provider has a free tier. Sign in to Resend/Anthropic with the **fha.wp.info@gmail.com** account and GitHub with **wp-cna**. You only copy a key from each — everything else is terminal.

| Key | Where | Notes |
|-----|-------|-------|
| `RESEND_API_KEY` | resend.com → API Keys → Create | Test mode sends only **to your own** address (the board's) — perfect for the board emails. Submitter-rejection emails need a verified domain (see bottom). |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Powers the posting-board reviewer. |
| `GITHUB_TOKEN` | github.com → Settings → Developer settings → **Fine-grained tokens** | Repo access: **wp-cna/FHA** only. Permission: **Contents → Read and write**. Lets approved posts commit to `data/posts.json`. |

> Terminal-only alternative for the GitHub token: `gh auth login` then `gh auth token` gives a working token immediately — broader scope than a fine-grained PAT, but fine if you'd rather not touch the web UI.

## Step 1 — Deploy the Worker (all terminal)
```bash
npm install -g wrangler
cd backend
wrangler login                              # opens a browser tab once to authorize Cloudflare

# optional but recommended: anti-spam rate limiting (5 submissions/sender/hour)
wrangler kv namespace create RATE_LIMIT     # prints an id — paste it into wrangler.toml,
                                            # then uncomment the [[kv_namespaces]] block there

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

# board post (runs the AI reviewer; a clean post should publish to data/posts.json)
curl -sX POST $W/post -H 'content-type: application/json' \
  -d '{"name":"Test","email":"you@example.com","postType":"Local business or service","title":"Joe'\''s Bakery","message":"New bakery open on Mitchell Place — come say hi."}'
```
Each returns `{"ok":true}`. Watch it live with `wrangler tail` in another terminal.

> Heads-up: a passing `/post` test **publishes a real card** to `data/posts.json` (it commits to the repo). Either use an obvious test title and delete that entry afterward, or skip the `/post` curl and test it from the live form once you're happy.

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
