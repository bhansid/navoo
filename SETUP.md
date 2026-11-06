# Navoo waitlist - setup guide (Netlify free + Google Sheets)

How it works:

```
Visitor's browser ──► Netlify (free hosting)
                        ├─ the landing page
                        └─ /api/subscribe function ──► Google Apps Script ──► your Google Sheet
                                                   └─► Meta Conversions API (Lead)
```

Total time: about 20 minutes. You need a Google account, a GitHub account and a Netlify account (all free).

---

## Step 1 - Google Sheet (your database)

1. Go to sheets.google.com and create a blank sheet. Name it **Navoo Waitlist**.
2. Menu **Extensions → Apps Script**.
3. Delete everything in the editor, then paste the full contents of `google-apps-script/Code.gs`. Click **Save** (💾).
   - Line 9 already has a secret filled in: `const SECRET = '…'`. **Copy that value** - you'll need it in Step 3.
4. In the function dropdown at the top pick **setup**, click **Run**.
   - Google asks for permission → **Review permissions** → choose your account → **Advanced** → **Go to … (unsafe)** → **Allow**. (It says "unsafe" only because it's your own unpublished script.)
   - Back in the sheet you'll see a new **Submissions** tab with headers.
5. Click **Deploy → New deployment**.
   - Gear icon ⚙ → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**  ← important, otherwise sign-ups fail
   - Click **Deploy** and **copy the Web app URL** (ends in `/exec`).
6. Test: paste that URL in a new browser tab. You should see `{"ok":true,"service":"navoo-waitlist",…}`.

> If you ever edit Code.gs later: **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The URL stays the same. If you skip this, the old code keeps running.

## Step 2 - Put the code on GitHub

1. github.com → **New repository** → name `navoo` → choose **Private** → **Create repository**.
2. On the empty repo page click **uploading an existing file**.
3. Unzip the project. Open the `navoo-netlify` folder, select **everything inside it** (site, netlify, google-apps-script, tracking, build.js, netlify.toml, package.json, …) and drag it into the GitHub page.
   - Hidden files like `.gitignore` may not upload - that's fine.
   - Make sure the folder `netlify/functions/subscribe.mjs` uploaded (it's what saves sign-ups).
4. Click **Commit changes**.

## Step 3 - Deploy on Netlify

1. app.netlify.com → sign up with GitHub → **Add new site → Import an existing project → GitHub** → pick `navoo`.
2. Netlify reads the settings from `netlify.toml` automatically (build command `node build.js`, publish `dist`). Don't change them.
3. Before deploying, click **Add environment variables** (or after: **Site configuration → Environment variables → Add a variable**). Add:

| Key | Value | Required |
|---|---|---|
| `SHEETS_WEBHOOK_URL` | the `/exec` URL from Step 1 | ✅ |
| `SHEETS_SECRET` | the secret from Code.gs line 9 | ✅ |
| `META_PIXEL_ID` | your Pixel ID (digits only) | for Meta ads |
| `META_CAPI_TOKEN` | Events Manager → your dataset → Settings → Conversions API → Generate access token | for Meta ads |
| `META_TEST_EVENT_CODE` | e.g. `TEST12345` from Events Manager → Test events - **delete after testing** | optional |
| `GTM_ID` | `GTM-XXXXXXX` | optional |
| `GA4_ID` | `G-XXXXXXXXXX` (skip if GA4 is set up inside GTM) | optional |
| `GOOGLE_ADS_ID` / `GOOGLE_ADS_LEAD_LABEL` | `AW-…` and the conversion label | optional |

4. Click **Deploy**. After ~1 minute you get a URL like `navoo-123.netlify.app`.
5. **Test it:** open the site, enter your email, click Join. The row should appear in your Google Sheet within a few seconds.

> Changed an environment variable? It only applies after a new deploy: **Deploys → Trigger deploy → Deploy site**.

## Step 4 - Your own domain (optional)

Netlify → **Domain management → Add a domain** → follow the DNS instructions at your domain registrar. HTTPS is set up automatically.

---

## Checking Meta tracking
1. Set `META_TEST_EVENT_CODE`, redeploy.
2. Events Manager → **Test events** → open your site, sign up with a test email.
3. You should see **PageView** and **Lead** from the browser and **Lead** from the server, marked as de-duplicated.
4. Remove `META_TEST_EVENT_CODE` and redeploy.

Data layer events for GTM: `waitlist_form_start`, `cta_click`, `waitlist_signup` (with `event_id`, `form_location`, `duplicate`).

Keep the Meta Pixel in the `META_PIXEL_ID` variable, **not** inside GTM as well, or PageView and Lead will count twice. Use GTM for everything else.

## Extra scripts
Paste TikTok, Clarity, Hotjar or a cookie banner into `tracking/custom-head.html` (edit it on GitHub). It's added on the next deploy.

## Netlify free plan - things to know
- Free plan = **300 credits/month**. Each production deploy costs about **15 credits**, and every GitHub commit triggers a deploy. Make your edits in one go instead of many small commits.
- Bandwidth and visits are cheap for a page this size (~300 KB), so tens of thousands of visits a month fit.
- **If credits run out, Netlify pauses the site until next month.** While running paid ads, check **Team → Usage** weekly. If you get close, upgrade or pause ads.

## Where things live
```
site/                     the page (index.html, styles.css, app.js, images)
netlify/functions/        subscribe.mjs - the backend
google-apps-script/       Code.gs - paste into your Google Sheet
tracking/                 custom-head.html / custom-body.html for extra scripts
build.js                  injects tracking tags at deploy time
netlify.toml              Netlify settings
```

## Before launch
- Replace `site/privacy.html` with your real privacy policy. Collecting emails + ad pixels usually also needs a cookie consent banner in the UK/EU/AU.
- Swap the photos and logo in `site/assets/` for the original high-res files when you have them.
- Keep the GitHub repo **private** (Code.gs contains your secret).
