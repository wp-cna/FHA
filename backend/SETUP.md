# FHA forms backend — setup

A Cloudflare Worker that powers the **Contact** form and the **Posting board** (with AI review).
The static site keeps working without it; deploying this turns the forms real.

## What it does
- `POST /contact` → emails the board at **fha.wp.info@gmail.com** (via Resend).
- `POST /post` → runs the AI reviewer (`../MODERATION.md`), then publishes approved posts to `data/posts.json`, emails the board for escalations, or emails the submitter on rejection.

## Accounts you'll need (all have free tiers)
1. **Cloudflare** — to run the Worker.
2. **Resend** (resend.com) — to send email. Sign in **with the fha.wp.info@gmail.com account**. Grab an API key. To send *from* your own address you'll verify a domain; until then the Worker uses `onboarding@resend.dev` (works for testing).
3. **Anthropic** (console.anthropic.com) — an API key for the reviewer. Sign in with the FHA account.
4. **GitHub** — a fine-grained personal access token for the **wp-cna** account with **Contents: read & write** on the `wp-cna/FHA` repo (so approved posts can be committed).

## Deploy
```bash
npm install -g wrangler
cd backend
wrangler login                 # authorizes Cloudflare

# set the three secrets (you'll be prompted to paste each)
wrangler secret put RESEND_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GITHUB_TOKEN

wrangler deploy
```
Wrangler prints your Worker URL, e.g. `https://fha-forms.<subdomain>.workers.dev`.

## Connect the site
1. Open `../forms.js`, set `API_BASE` to that Worker URL.
2. Commit/push the site (Codex) so `forms.js` ships.
3. Test: submit the Contact form (board gets an email) and a board post (you get a review email or it appears).

## Notes
- **Sending domain:** for a polished "from" address, verify a domain in Resend and set `MAIL_FROM` in `wrangler.toml`. Otherwise leave the test sender.
- **Rate limiting** (optional): `wrangler kv namespace create RATE_LIMIT`, then uncomment the `kv_namespaces` block in `wrangler.toml` and redeploy. Caps each sender at 5 submissions/hour.
- **Model:** the reviewer uses `claude-haiku-4-5-20251001` (cheap/fast). Swap `MODEL` in `worker.js` for a stronger model if you want.
- **Config** (non-secret) lives in `wrangler.toml`: allowed origin, board email, from address, repo.
