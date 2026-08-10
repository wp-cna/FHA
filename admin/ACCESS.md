# Who can use the FHA content admin, and how to get in

The admin lives at **https://wp-cna.github.io/FHA/admin/** — sign in with your
GitHub account. Bookmark that link.

There is no separate username/password list for the admin. Signing in happens
through GitHub, and any GitHub account with **write access to the `wp-cna/FHA`
repository** can edit the site.

## How to get in (both editors, today)

Michael Dalton and Mike Kushman both have the **`wp-cna`** GitHub account, which
owns this repository — so there is nothing to set up:

1. Go to **https://wp-cna.github.io/FHA/admin/**
2. Click **Sign in with GitHub**.
3. If prompted, sign in as **wp-cna**, then **Authorize** the app (first time only).

That's it — you're in the editor. Bookmark the admin link.

## Optional later: sign in as yourself instead

Using the shared `wp-cna` login works, but every change is recorded as having
been made by "wp-cna," so the history can't tell the two of you apart. If you'd
rather each sign in under your own name, add your personal GitHub account once:

- Signed in as `wp-cna`, go to **https://github.com/wp-cna/FHA/settings/access**
  → **Add people** → type the username → **Add to this repository**.
- That person clicks **Accept invitation** in the email GitHub sends.
- Mike's account is `mike-kushman` (an older `never-nude` account also exists —
  add whichever you actually use, or both).

After that, each of you signs in to the admin with your own GitHub account and
no one needs the shared password for day-to-day editing.

## What saving does

Every "Save" in the admin becomes a commit to the `wp-cna/FHA` repository, and
GitHub Pages republishes the live site automatically. Changes appear at
https://wp-cna.github.io/FHA/ within about a minute — no other steps.

One caution: the **Events** page is imported automatically every night from the
city calendar, so it is not edited in the admin. Everything else — Neighborhood
Posts, Agendas & Minutes — is yours to edit.

That is not the same as an FHA event. To announce something the Association is
running — a block party, a cleanup, a meeting — add a **Neighborhood Post** and
choose the category "Neighborhood Event". Set its date to **the day the event
happens**, not the day you are writing it: the site shows that date on the card
and keeps the post up until the event has passed.
