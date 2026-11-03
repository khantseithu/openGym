# Personal deployment on Vercel (static, no backend)

A single-user openGym served as static files from Vercel Hobby. Your data stays in your browser.

```
Phone / desktop browser  ->  Vercel static hosting (React + Vite build + exercise media)
        |
        +-> localStorage (workouts, plan, settings) and IndexedDB (custom exercise media)
```

No API server, database, sign-in, Vercel Functions, analytics or paid services.

## What `VITE_STATIC=1` changes

- The app always runs as a guest. There is no sign-in screen and no `/api` request (`lib/api.js`
  refuses before the network).
- It starts empty. Unlike `VITE_DEMO=1`, it never seeds example data.
- Rows that need a server (sign-in, sync, web push) are hidden or say they are not available.

Other builds are unaffected: the flag is off unless set.

## Local development

Node 22, as upstream's CI uses.

```bash
cd frontend
npm ci --ignore-scripts
VITE_STATIC=1 npm run dev          # hot reload
npm run build:static               # production build plus exercise media, into dist/
npx vite preview                   # serve dist/
npm test
```

The service worker only registers over HTTPS, so offline behaviour has to be tested on a deployment.
A date-related Health test can fail outside UTC; run with `TZ=UTC` to compare against CI.

## Build and Vercel configuration

`vercel.json` and `package.json` at the repository root set everything; the only project setting that
matters is the Git connection.

- Builder: `@vercel/static-build`, set explicitly. Without it Vercel turns the repository's `api/` folder
  into Serverless Functions and the deployment fails on Hobby's limit of 12. Do not remove `builds`, and do not
  ignore `api/` either, because the frontend imports `api/coach/core` at build time.
- Build: the `vercel-build` script in the root `package.json` installs `frontend/` and runs
  `build:static` (Vite, then `scripts/catalogue/stage-media.mjs`)
- Output: `frontend/dist`, about 250 MB and 13,000 files
- Routes: the app routes behind the hash (`/#/plan/r/<id>`), so reloading a nested route needs nothing
  from the host. A plain path such as `/plan` redirects to `/#/plan`. Missing files and `/api/*` answer
  404, never `index.html`.
- Headers: the same Content-Security-Policy and security headers as `web/Dockerfile` and
  `web/nginx.conf.template`. `frontend/src/lib/static-build.test.js` fails if the policy drifts, for
  example when upstream changes the inline script in `index.html`. Update both files together.

## Deploying and redeploying

Deploy through Git. The build output is well over the 100 MB that Vercel documents as the Hobby limit
for `vercel deploy` uploads, while a Git deployment builds on Vercel.

- Push to `main`: production deployment.
- Push to any other branch: preview deployment, behind Vercel Authentication (`vercel curl` reaches it).
- Redeploy without changes: `vercel redeploy <deployment-url>`, or the dashboard.

Always use the production domain on your phone, never a deployment-specific URL. Storage belongs to one
origin: a different address is a different, empty app.

## Updating from upstream

```bash
git fetch upstream
git checkout -b upstream-sync origin/main
git merge upstream/main
TZ=UTC npm --prefix frontend test
git push -u origin upstream-sync     # check the preview, then merge into main
```

This fork removed what the static deployment does not use, so a merge reports modify/delete conflicts when
upstream changes those files. Keep them deleted, then commit and run the tests:

```bash
git status --short | awk '/^(DU|UD) /{print $2}' | xargs git rm -q
```

Also delete any new upstream test that fails only because it reads a removed path. Never open a pull request
against upstream by accident: `gh pr create` needs `--repo khantseithu/openGym`.

Removed from this fork: `frontend/android`, `frontend/ios`, `helm`, `kubernetes`, `contrib`, `website`, `mcp`,
GitHub and GitLab CI, Docker Compose, the API server (except `api/coach/core`, which the frontend build imports,
and `api/sync-stamps.js`, which the sync tests compare against) and the tests that only checked those. To run the
server or build the native apps, use upstream. `CLAUDE.md`, `README.md` and `docs/` are upstream's and still
describe them.

## Your data: limits of browser storage

Browser storage is not permanent and nothing here makes it so. It normally survives reloads, browser
restarts and new deployments on the same domain. It can be lost when:

- you clear site data, or delete the home-screen app
- the domain changes
- the browser evicts it under storage pressure (the app asks for persistent storage, which browsers may
  decline)
- on iPhone, Safari removes a site's storage after 7 days of browser use without visiting it; a
  home-screen app is not subject to that rule

There is one more iPhone catch: **Safari and the home-screen app do not share storage.** Add the app to
the Home Screen first (Share, then Add to Home Screen) and log only from there. If you already logged in
Safari, export there and import in the home-screen app.

localStorage is also limited to about 5 MB per site, which is a lot of workouts as text, but custom
exercise photos and videos live in IndexedDB and count against the browser's quota instead.

## Backup and restore

**Export:** Settings, Data & backup, Export backup (JSON). If you use custom exercise photos or videos, use
Export with photos & videos (.zip) instead. Save the file somewhere outside the browser, such as iCloud Drive.
Spreadsheet (CSV) export is there too, but use the JSON for restoring.

**Restore:** Settings, Data & backup, Import backup. It asks first: an import replaces the current data, and if
this browser holds workouts the backup lacks, it offers to merge them in.

**Recommended routine:** export after every few sessions, at least weekly, and before clearing browser data,
changing phones or changing domains. Keep the last few files. The backup is the only copy outside the browser;
there is no automatic one on the web.

If stored data is ever unreadable, the app starts empty and keeps the raw text in localStorage under
`gym_state_v1_unreadable` rather than overwriting it.

## Not available without a backend

- Accounts, passkeys, sync across devices, device linking: each browser is its own separate copy
- Web push: rest-timer and workout reminders when the app is closed. The rest timer itself works in the app
- AI Coach (the server path; the phone-only path exists only in the native apps)
- Admin dashboard, invites, activity log, server-side media sync
- The MCP server and the native iPhone, Android and Watch apps (removed from this fork; upstream has them)

Hevy API import remains optional: it runs only when you use it, and it talks directly to Hevy with your key.

## Vercel Hobby and licences

Hobby is free and for personal, non-commercial use. It includes 100 GB of data transfer and 1,000,000 CDN
requests per month. Going over pauses the feature until the period resets rather than billing you, per Vercel's
docs. Check the current figures at <https://vercel.com/docs/limits>.

openGym is AGPL-3.0: this fork stays public, and Settings, About links to its source. The exercise media are
licensed separately by Gym visual (`NOTICE.md`): only the 180 px files in this repository may be served, and
they may not be copied out of openGym or hotlinked.
