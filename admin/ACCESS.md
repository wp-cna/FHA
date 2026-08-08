# Who can use the FHA content admin, and how to get in

The admin lives at **https://wp-cna.github.io/FHA/admin/** — sign in with your
GitHub account. Bookmark that link.

There is no separate username/password list for the admin. Signing in happens
through GitHub, and anyone whose GitHub account has **write access to the
`wp-cna/FHA` repository** can edit the site. That's the whole access system:
being added as a "collaborator" on the repository *is* being given an admin
login.

## Michael Dalton — first-time setup

1. Create a free GitHub account using **michael@mdalton.com**: go to
   [github.com](https://github.com) → **Sign up**, follow the prompts, and pick
   any username you like.
2. Tell the holder of the `wp-cna` account your new username. They will add
   you: on GitHub, repository `wp-cna/FHA` → **Settings** → **Collaborators** →
   **Add people** → type your username → click **Add to this repository**.
   (Collaborators automatically get edit access — there is no role to choose.)
3. You'll get an email invitation from GitHub — open it and click **Accept
   invitation**.
4. Done, forever. From now on: go to
   **https://wp-cna.github.io/FHA/admin/**, click **Sign in with GitHub**, and
   edit. No developer needed.

## Mike Kushman

Same idea — add the existing GitHub account tied to
**michael.kushman@gmail.com** as a collaborator on `wp-cna/FHA`
(steps 2–3 above).

## Fallback

The **`wp-cna`** GitHub account that owns the repository always works as a
login of last resort. It should be held by **one designated person** (GitHub
accounts may not be shared between people) and used only if the normal
collaborator logins are ever locked out — day to day, everyone signs in with
their own account.

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
