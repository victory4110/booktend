# Booktend
    
    Booktend is a service booking and job tracking app. It helps service businesses take bookings and manage each job through completion. Multiple businesses can create separate workspaces in the same app; each workspace has its own jobs, customers, owner account, time zone, and public booking URL.
    
    It is a **single full-stack Next.js app** (App Router): the UI and the JSON API live in one project. The API is implemented as Next.js Route Handlers under `app/api`, backed by MongoDB via Mongoose.
    
    ## Features
    
    - Business workspace sign-up with a unique booking URL.
    - Owner sign-in scoped to a workspace.
    - Public booking page at `/book/:workspace-slug`.
    - Staff dashboard with counts, schedule, customer list, search, filtering, and paged jobs.
    - Job creation, status changes, and status history.
    - SMTP booking confirmations and staff notifications through a retrying outbox, delivered by a scheduled worker.
    - Encrypted session cookies (iron-session), CSRF protection, per-route rate limits, and scrypt password hashing.
    
    ## Project layout
    
    ```
    app/                          Next.js App Router: pages and the JSON API
    ├─ layout.tsx                 root layout
    ├─ page.tsx                   staff sign-in / dashboard
    ├─ profile/page.tsx           account and workspace details
    ├─ book/[slug]/page.tsx       public booking page
    ├─ global.css                 Tailwind v4 entry (theme + utilities only)
    └─ api/…                      route handlers (auth, jobs, bookings, services, customers, overview, health, csrf)
    src/
    ├─ components/                AppShell (sidebar, topbar, account menu), Dashboard, LoginScreen
    ├─ lib/                       client types + formatters
    ├─ services/api.ts            client fetch + CSRF helper
    ├─ server/                    backend: db/models, cursor, session, csrf, rate limit, mail worker, zod schemas
    └─ styles/                    the Booktend CSS (dashboard, booking, skeleton, profile)
    ```
    
    Import paths use the `@/*` alias, which maps to `src/*` (see `tsconfig.json`).
    
    ## Styling
    
    The look of the app comes from the hand-written stylesheets in `src/styles`, which are imported per page. Tailwind v4 is available for utility classes: `app/global.css` imports the theme and utilities layers only (no Preflight, so it does not reset the app's own element styles) and exposes the `--color-background` and `--color-foreground` tokens. There is no `tailwind.config.js`; Tailwind v4 reads sources from the `@source` globs in `app/global.css`.
    
    ## Run locally
    
    Use Node.js 20+ and MongoDB 6 or newer. Copy `.env.example` to `.env`, set a private `SESSION_SECRET` with at least 32 characters, and point `MONGODB_URI` at MongoDB. SMTP settings are optional in development.
    
    ```sh
    npm install
    npm run dev        # http://localhost:3001 (see the dev script in package.json)
    ```
    
    Open `http://localhost:3001`, choose **Create a business workspace**, and set the business name, URL slug, owner account, and time zone. The owner can share the resulting `/book/:workspace-slug` link with customers.
    
    ## Checks
    
    ```sh
    npm run typecheck  # strict TypeScript, no emit
    npm test           # node:test suites run through tsx
    npm run verify:api # end-to-end HTTP checks against a throwaway server
    npm run build      # production build
    ```
    
    `npm test` covers the pagination cursor (pure unit tests) and the booking reference
    allocator (integration tests that talk to MongoDB). The integration tests create and
    drop their own `booktend_test_*` database and skip themselves if MongoDB is not
    reachable, so the suite still passes without a database running.
    
    `npm run verify:api` drives the real HTTP API: it copies the project to a scratch
    directory, starts `next dev` there on a free port against a throwaway
    `booktend_verify_*` database, and walks through signing up, booking, paging,
    filtering, status changes, service edits, tenant isolation, and anonymous public
    booking. It tears the server down and drops the database afterwards, so it never
    touches your development data or a server you already have running.
    
    Use Node 22.6 or later so `tsx` can run the TypeScript scripts directly.
    
    ## Production build
    
    Set `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DATABASE`, a strong `SESSION_SECRET`, and SMTP settings in the hosting platform.
    
    ```sh
    npm run build
    npm start          # next start on port 3000
    ```
    
    Configure HTTPS at the hosting provider, database backups, and monitoring. `GET /api/health` reports database availability and failed notification counts. Run one instance until the in-memory rate limits are moved to a shared store.
    
    ## Email outbox
    
    Booking confirmations and staff notifications are written to the `mail_outbox` collection and delivered by a worker that starts on first import of `src/server/mail.ts` (in the Node runtime only) and ticks every ten seconds. A message is retried with exponential backoff up to five attempts, then marked `failed`. There is no separate worker process to run.
    
    ## Admin bootstrap
    
    `npm run create-admin` creates or updates a workspace owner from `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and the optional `BUSINESS_*` environment variables.
    
    ## Remaining work before public launch
    
    - Verify business email ownership and add staff invitations and password reset.
    - Add automated coverage for the HTTP route handlers themselves: sign-up, sign-in, tenant isolation, bookings, and status updates. The pagination cursor and the booking reference allocator are covered; the routes are not.
    - Configure production database and SMTP credentials, backups, monitoring, and a privacy policy for the business data collected.
    - Move rate-limit storage to a shared store (e.g. Redis) before running more than one instance.
    
    Strict TypeScript checks run with `npm run typecheck`.
    