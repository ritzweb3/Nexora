# Nexora

A creator x project marketplace built around **manual verification**: projects
send campaign funds straight to your company wallet, you confirm receipt by
eye, assigned creators can submit unlimited post links until a campaign's
deadline, and you check each link's real numbers yourself before paying their
registered wallet. The app's job is to collect the details, track each link's
status, and do the arithmetic -- not to move money or verify anything
automatically. Sign-in is email/password or Google only.

Everything runs as **one single app** (one server, one port, one thing to
deploy) -- the front end is served by the same Express server that runs the
API, so there's no separate hosting, no CORS setup, and no API URL to
configure.

## Quick start (2 commands, nothing to edit)

```bash
npm install
npm start
```

**`npm install` has nothing to compile** -- there's no native module in this
project (no `better-sqlite3`, no `ethers`), so it can't fail the way those
packages often do on machines without a C++ build toolchain installed. The
database is a plain JSON file. On first run, the app automatically:
- generates a real `JWT_SECRET`
- generates a random admin password and prints it once to the console (also
  saved to `ADMIN_CREDENTIALS.txt` in this folder)

Open **http://localhost:4000** -- that's the whole app: landing page,
signup, login, creator/project dashboards, and the admin console (log in
with the admin email/password printed on first boot -- same login form as
everyone else, it just detects an admin login and takes you to the admin
console).

Want some demo data instead of a blank app?
```bash
npm run seed
```
Adds 3 demo projects and 6 demo creators, plus three campaigns in different
real-world states: fully paid out, payment sent but awaiting your
verification, and a brand new unpaid campaign. All demo logins use password
`password123`.

Run the automated tests any time:
```bash
npm test
```

## How a campaign actually works (this is the whole product)

1. **Project creates a campaign** -- title, brief, how many creators they
   need, how long it runs, an about section, and at least one social handle
   so creators can learn about the project. They see your company wallet address on this
   page and a checkbox: "I've sent the funds." They can check it now or
   come back later once they've actually sent the money.
2. **You verify the payment yourself** -- check the chain by hand
   (`/admin/campaigns`), click "Mark payment verified." The campaign goes
   live. The app hands you a pre-filled email (to the project, confirming
   receipt) that you send from your own inbox -- nothing is emailed
   automatically anywhere in this app.
3. **You assign creators** -- also by hand, from the same admin campaign
   page. There's no matching algorithm; you pick who's right for it.
4. **Creators can browse every campaign** on the creator marketplace. They
   can submit links only to campaigns assigned to them, with no submission
   count limit before the campaign countdown expires. Each post link is
   tracked independently; creators can see whether each one is awaiting
   review, verified/pending payout, or paid.
5. **You review each link** (`/admin/submissions`) -- look at the real post,
   type in the views and likes you actually see, and either use "Suggest"
   (a simple rate-per-1000-views / rate-per-500-likes calculator) or type
   your own payout number. Nothing here trusts the creator's self-report.
6. **You send the crypto yourself**, outside this app, to the wallet
   address the creator registered at signup. Click "Mark as paid" and the
   app hands you a pre-filled email to the creator confirming it's sent.

Every status change is visible on the relevant dashboard immediately --
projects see their campaign go from "awaiting your payment" to "awaiting our
verification" to "live" to seeing real payout numbers per creator; creators
see the per-link status "submitted" -> "verified" -> "paid." The creator and
admin leaderboards total views and likes from verified links and show each
creator's total paid. The emails are a convenience on top of that, not a
replacement for it.

## What's real here

- **Password auth** -- bcrypt + JWT, for creators and projects.
- **Google sign-in** -- a genuine OAuth 2.0 code exchange. Needs your own
  Google OAuth client to fully complete (see below). That, plus
  email/password, are the *only* two sign-in methods -- no wallet-signature
  login, no Apple, no X.
- **Admin login** -- no hardcoded credentials anywhere in the code. It's
  environment-configured and bcrypt-hashed, checked only on the server. It
  uses the same login form as everyone else: enter the admin email/password
  where you'd normally enter creator or project credentials.
- **Wallet address collection** -- creators must give a plausible ETH
  address (`0x` + 40 hex characters) at signup. This is a *format* check
  only, not proof of ownership -- there's no signature verification, since
  sign-in no longer goes through a wallet at all. Google sign-ups are asked
  for it right after their first login, since Google doesn't provide one.
- **The suggested-payout formula** -- unit tested. It's a starting point
  (`RATE_PER_1000_VIEWS` x views/1000 + `RATE_PER_500_LIKES` x likes/500,
  both configurable in `.env`); you can always type a different number
  before saving a review.
- **Every dollar figure is manually entered by you** -- views, likes, and
  the final payout are exactly what you typed into the review form. Nothing
  pulls data from a social platform's API.

## Going to production: the fastest realistic path

**Recommended: [Render](https://render.com).**
- One-click deploy from a GitHub repo, free HTTPS, and a **persistent disk**
  add-on -- you need that persistent disk because this app's database is a
  plain JSON file (`nexora-data.json`) that needs to survive restarts and
  deploys.
- **Do not deploy this to Vercel or Netlify as-is.** Both are serverless --
  every request can hit a fresh, ephemeral filesystem, which means your JSON
  database file would silently reset between requests.
- Railway and Fly.io are equally good alternatives with the same "add a
  persistent volume" requirement.

**Steps on Render:**
1. Push this folder to a GitHub repo.
2. Render dashboard -> New -> Web Service -> connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add a **Disk** mounted at, say, `/data`, and set an environment variable
   `DB_PATH=/data/nexora-data.json` so the database lives on the persistent
   disk instead of the app's ephemeral filesystem.
5. Set environment variables in Render's dashboard (do **not** commit these
   to the repo):
   - `JWT_SECRET` -- generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` -- your real admin login
   - `COMPANY_WALLET_ADDRESS` -- the real wallet projects should send funds to
   - `RATE_PER_1000_VIEWS` / `RATE_PER_500_LIKES` -- your actual payout rates
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` -- see below
6. Deploy. Render gives you a URL like `https://nexora.onrender.com` -- that's
   your whole app, live.

(Setting real env vars in step 5 means the zero-config auto-generation in
`src/utils/bootstrapEnv.js` won't trigger -- that auto-generation is a local
dev/first-look convenience, and explicit production env vars always win.)

**Once you outgrow a single instance:** the database lives entirely behind
the functions exported from `src/db/index.js` (`findCreatorById`,
`insertCampaign`, etc.) -- swap that one file's implementation for Postgres
(via `pg`) or another real database, and nothing in the route files needs to
change.

## Before you consider this "launched"

1. **Set `COMPANY_WALLET_ADDRESS`.** This is shown directly to every project
   creating a campaign -- the placeholder value is not a real address.
2. **Set real `JWT_SECRET` and `ADMIN_PASSWORD`** -- don't run on the
   auto-generated dev secrets in production.
3. **Set your real payout rates** (`RATE_PER_1000_VIEWS`,
   `RATE_PER_500_LIKES`) -- these are just a starting suggestion on the
   review form, but get them close to what you actually intend to pay.
4. **Register a Google OAuth client** (console.cloud.google.com -> APIs &
   Services -> Credentials -> OAuth client ID -> Web application). Set the
   authorized redirect URI to `https://yourdomain.com/auth/google/callback`,
   then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `GOOGLE_REDIRECT_URI` in your environment.
5. **Add rate limiting** on `/auth/*` -- `npm install express-rate-limit` and
   wrap the auth router; a few lines, meaningfully reduces brute-force risk.
6. **Decide how you're actually sending crypto.** This app tracks status and
   does math -- it never moves funds itself, on either side. That's by
   design (see the note below), but it means your actual sending process
   (a multisig, an exchange, a hardware wallet, whatever you already use)
   is entirely outside this app and worth having a clear checklist for
   before you're doing it under time pressure.

## A note on why so much of this is manual, on purpose

You asked for this, and it's a reasonable call for an early-stage platform:
manual verification means no smart contract risk, no automated engagement
API to integrate and maintain (X's API alone has changed pricing multiple
times), and no algorithm that can be gamed. The tradeoff is your own time --
every payment and every payout goes through your hands. If volume grows
enough that this becomes the bottleneck, the natural next steps are (a) a
real payments/on-chain integration for verified, low-risk payouts, and
(b) pulling real engagement numbers from platforms where it's genuinely
possible (YouTube's public API is the easiest one; the others need the
creator's own OAuth consent). Neither is a good idea to add before you have
a real backlog proving you need it.

## Project structure

```
nexora/
  public/index.html         the entire front end (served as a static file)
  src/
    server.js                Express app -- serves the API and the front end
    utils/bootstrapEnv.js    zero-config .env + secret generation
    utils/payout.js          wallet-address format check + suggested-payout formula
    db/index.js              JSON-file data store
    routes/                  auth, creators, projects, admin
  scripts/seed.js            demo data
  tests/                     automated tests (node --test)
  .env.example               every environment variable, documented
```

## API reference

All authenticated routes take `Authorization: Bearer <token>`.

**Auth**
- `POST /auth/signup` `{ role, name, email, password, walletAddress? }` -- walletAddress required for role "creator"
- `POST /auth/login` `{ role, email, password }`
- `POST /auth/admin-login` `{ email, password }`
- `GET /auth/google?role=creator|project`

**Creator**
- `GET /creators/me`
- `PUT /creators/me/socials`
- `PUT /creators/me/wallet` `{ walletAddress }` -- for Google sign-ups completing their profile
- `GET /creators/me/campaigns`
- `GET /creators/campaigns` -- full campaign marketplace with assignment state and project socials
- `POST /creators/me/campaigns/:id/submit` `{ postUrl }`
- `GET /creators/me/payments`
- `GET /creators/leaderboard`

**Project**
- `GET /projects/me`
- `POST /projects/campaigns` `{ title, description, projectAbout, socials, creatorsNeeded, durationDays, amountSent?, paymentSent? }`
- `POST /projects/campaigns/:id/mark-payment-sent` `{ amountSent? }`
- `GET /projects/me/campaigns`
- `GET /projects/campaigns/:id`

**Admin**
- `GET /admin/overview` / `/rates` / `/campaigns` / `/campaigns/:id` / `/creators` / `/submissions/pending` / `/submissions/all` / `/rankings` / `/ledger` / `/financials`
- `POST /admin/suggest-payout` `{ views, likes }`
- `POST /admin/campaigns/:id/verify-payment`
- `POST /admin/campaigns/:id/assign` `{ creatorId }`
- `POST /admin/campaigns/:id/unassign` `{ creatorId }`
- `POST /admin/submissions/:submissionId/review` `{ views, likes, payout }`
- `POST /admin/submissions/:submissionId/mark-paid`

**Public**
- `GET /stats` -- creator/campaign counts + company wallet address, for the landing/campaign-creation pages
- `GET /health`
