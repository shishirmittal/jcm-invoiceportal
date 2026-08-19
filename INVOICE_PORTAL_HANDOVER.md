# Invoice Portal (invoice.jcmretails.com) — Handover Spec

## 0. What this is
A brand-new, standalone, mobile-only web app — separate from the internal
JCM-Tools CRM/Order Planning app. Customers use this to look up and view
their own past invoices. No login accounts, no OTP, no PIN — verification
is: mobile number + last 4 digits of any of their own invoice numbers.

## 1. Stack (match the existing pattern used elsewhere in this project)
- Vite + vanilla JS (or plain HTML/CSS/JS — this app is simple enough that
  a build step isn't strictly required, but Vite keeps it consistent with
  other JCM tools)
- Deployed on Vercel, as its OWN project (not part of the JCM-Tools Vercel
  project) — this is what allows it to live at its own subdomain
- The `api/lookup-invoices.js` file (already written, in this same folder)
  is a Vercel Serverless Function — Vercel auto-detects anything in an
  `/api` folder at the project root and deploys it as a backend endpoint.
  No separate backend server needed.

## 2. Critical security rule — do not deviate from this
The frontend must NEVER import `@supabase/supabase-js` or hold any Supabase
key. All data access goes through one call: `POST /api/lookup-invoices`
with `{ mobile, last4 }` in the body. The serverless function (already
written) does all verification and only returns data once both pieces
check out together. This is deliberate — the underlying Supabase tables
have zero public access (RLS locked, no policies), so this API route is
the only door in. Do not add a Supabase client to the frontend "for
convenience" — it would have nothing to connect to anyway (no policies
grant it access), and defeats the security model if a service key ever
gets added there later.

## 3. Environment variables (set in Vercel project settings, NOT committed to git)
```
SUPABASE_URL=https://jlkjjqnmhsgefpluemyz.supabase.co
SUPABASE_SERVICE_KEY=<the sb_secret_... key, same one used by the sync scripts>
```
These are used only by `api/lookup-invoices.js`, server-side. Never expose
the service key in any frontend file or `VITE_`-prefixed env var (those get
bundled into the public JS and would leak it).

## 4. Screens (mobile-only — design for a narrow viewport, ~380-420px, no
desktop layout needed)

### Screen A — Login
- JCM Retails branding/logo at top
- Two inputs: "Mobile Number" (10-digit, numeric keypad on mobile), "Last 4
  digits of any invoice number" (4-digit, numeric keypad)
- One button: "View My Invoices"
- On submit: POST to `/api/lookup-invoices`. Show a loading state (the
  query can take a second or two).
- Error states to handle distinctly (the API returns different messages
  for each): no account found for this mobile number vs. invoice code
  doesn't match. Show the API's error message directly, no need to
  reinterpret it.
- On success: store the returned `{ customer, invoices }` in memory (React
  state / a simple JS variable — NOT localStorage, since this is
  unauthenticated and shouldn't persist across sessions on a shared
  device), navigate to Screen B.

### Screen B — Invoice List
- Greeting: "Hi, {customer.name}" or similar
- List of invoices, most recent first (API already sorts this way), each
  showing: invoice number, date, total amount
- Tap an invoice to open Screen C
- A search/filter box at top that filters the list by item name typed in
  (client-side filter across each invoice's `items` array — no new API
  call needed, since Screen A already fetched everything)
- A "Log out" / "Search another number" option to go back to Screen A
  (just clears the in-memory state)

### Screen C — Invoice Detail
- Invoice number, date, total, taxable amount at top
- Table/list of line items: item name, qty, rate, amount
- A "Download PDF" button — LOWER PRIORITY, can be a stretch goal. If
  built, generate a simple branded PDF client-side (e.g. using a library
  like `jspdf` or `pdf-lib`) from the already-fetched invoice+items data —
  no new backend endpoint needed for this, since the browser already has
  everything required.
- Back button to Screen B

## 5. Design direction
Keep it simple, clean, trustworthy — this is a financial document viewer,
not a marketing page. Reuse whatever brand colors/fonts JCM Retails already
uses in the quotation generator's PDF output (navy/gold letterhead
mentioned in that project) for visual consistency, but the app itself
should be plain and functional over flashy.

## 6. Domain setup (do this after the app is built and working on its
default Vercel URL)
1. In Vercel, create the project, deploy it, confirm it works at the
   auto-generated `*.vercel.app` URL first.
2. In Vercel project settings → Domains → add `invoice.jcmretails.com`.
3. Vercel will show a CNAME record to add. Go to wherever jcmretails.com's
   DNS is managed (the domain is still owned, confirm which registrar/DNS
   host it's with) and add that CNAME record for the `invoice` subdomain.
4. Wait for DNS propagation (usually minutes, occasionally up to a few
   hours), then Vercel auto-issues an SSL certificate once it detects the
   CNAME is live.

## 7. What NOT to build right now (explicitly out of scope for this pass)
- No customer accounts/login sessions beyond the per-visit lookup
- No admin panel (that's the internal JCM-Tools app's job, separately)
- No editing/downloading invoices in bulk
- No handling yet for the Nexus Enterprises / Silver Electric House
  "dummy ledger" invoices (their real end-customer isn't resolvable from
  Busy data alone yet — those customers' invoices simply won't be
  findable via this portal for now, which is a known, accepted gap)
