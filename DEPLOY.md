# Deploying Victual

Closed-test setup, about $1/month (a domain) on top of free tiers:

| Piece | Where | Cost |
|---|---|---|
| API (Spring Boot) | Render free web service, Docker | $0 |
| Database | Supabase (the existing project) | $0 |
| Email (codes) | Resend free: 3,000/month, 100/day | $0 |
| Keep-alive | UptimeRobot free, pings every 5 min | $0 |
| Marketing site | Vercel Hobby | $0 |
| Domain | any registrar (Cloudflare sells at cost) | ~$10-12/year |

When real users arrive: switch the Render service to the $7 instance (same URL, no
redeploy needed), and drop the keep-alive.

## 1. Domain and email (Resend)

The API emails verification and password-reset codes. Render's free tier blocks SMTP, so
it sends through Resend's HTTPS API, and Resend only delivers to anyone once you verify a
domain you own.

1. Buy a domain (for example `victual.app` or similar). Point it at Cloudflare or use your
   registrar's DNS.
2. resend.com: sign up, Domains > Add Domain. Use a subdomain like `mail.yourdomain.com`
   so the root stays free for the site. Add the DNS records it shows, wait for "Verified".
3. API Keys > Create (sending access only). Copy it once; it goes in `RESEND_API_KEY`.
4. `EMAIL_FROM` = `Victual <hello@mail.yourdomain.com>` (any name at the verified domain).

## 2. API on Render

1. Render dashboard > New > Blueprint > this repo. It reads `render.yaml`: a Docker web
   service from `backend/`, health check `/api/health`, redeploys only when `backend/`
   changes.
2. Fill in the secrets it asks for:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase > Connect > **Session pooler**, as JDBC: `jdbc:postgresql://<pooler-host>:5432/postgres` (same as `spring.datasource.url` in your `application-local.properties`) |
   | `DATABASE_USERNAME` | `postgres.<project-ref>` |
   | `DATABASE_PASSWORD` | the database password |
   | `JWT_SECRET` | a **new** one: `openssl rand -base64 32` (don't reuse your local one) |
   | `ADMIN_API_KEY` | a **new** one: `openssl rand -hex 32` |
   | `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | same as local |
   | `RESEND_API_KEY` / `EMAIL_FROM` | from step 1 |

3. First deploy builds the image (several minutes) and starts the app (a minute or two on
   the free CPU). Flyway runs any pending migrations on startup.
4. Check: `https://victual-api.onrender.com/api/health` (your URL is on the service page).

The first time, Render may suggest a region; keep it close to your Supabase region.

## 3. Keep it awake (UptimeRobot)

Free Render services sleep after 15 minutes without traffic, which would also stop the
hourly plan job and the Monday price refresh. uptimerobot.com > New monitor > HTTP(s) >
URL `https://<your-service>.onrender.com/api/health`, interval 5 minutes. One always-on
free service uses about 744 of the workspace's 750 free hours a month, so don't run a
second free service in the same Render workspace.

## 4. One database, two backends

Local dev and Render share the Supabase project, so don't let both run the scheduled jobs
(testers would get plans generated twice). In your local
`backend/src/main/resources/application-local.properties` add:

```properties
# Render runs the scheduled jobs; don't run them locally too
forkast.planner.cron=-
forkast.pricing.refresh-cron=-
```

Supabase's session pooler allows 15 connections in total: local uses up to 5, Render 3.

## 5. Marketing site on Vercel

Vercel > Add New > Project > import this repo, then:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js version (Settings > General) | 22.x |

No environment variables. `frontend/vercel.json` sends every path to `index.html`, so
`/privacy`, `/terms`, `/support` and `/delete-account` load directly (Google Play needs
the privacy and account-deletion URLs). Then Settings > Domains > add your domain and the
DNS records Vercel shows.

To keep site edits from redeploying when only the backend changes: Settings > Git >
Ignored Build Step > "Only build if there are changes in a folder" (`frontend`).

## 6. Point everything at the hosted API

- **Mobile:** `EXPO_PUBLIC_API_URL=https://<your-service>.onrender.com` in `mobile/.env`
  (and in the EAS build profile when building for Play).
- **Data pipeline:** to run `finish_round.py` and friends against production, set
  `FORKAST_API_URL=https://<your-service>.onrender.com` and `FORKAST_ADMIN_KEY` to the new
  admin key in `data_pipeline/.env`. Since the database is shared, catalog work done
  locally is already live; only the recipe re-costs need to run somewhere once.
