/**
     * End-to-end check of the HTTP API.
     *
     * Copies the project to a scratch directory, starts `next dev` there on a free
     * port against a throwaway database, exercises the booking flow the way the UI
     * and a public visitor do, then tears the server down and drops the database.
     * Nothing here touches the development database or a server you already have
     * running.
     *
     *   npm run verify:api
     */
    import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
    import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
    import { createServer } from 'node:net';
    import { tmpdir } from 'node:os';
    import path from 'node:path';
    import { setTimeout as delay } from 'node:timers/promises';
    import mongoose from 'mongoose';
    
    const projectRoot = path.resolve(import.meta.dirname, '..');
    const databaseName = `booktend_verify_${process.pid}`;
    
    interface Check {
      name: string;
      run: () => Promise<void>;
    }
    
    const results: { name: string; error?: string }[] = [];
    
    function check(name: string, run: () => Promise<void>): Check {
      return { name, run };
    }
    
    function equal(actual: unknown, expected: unknown, message: string): void {
      if (actual !== expected) throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    }
    
    function ok(value: unknown, message: string): void {
      if (!value) throw new Error(message);
    }
    
    async function freePort(): Promise<number> {
      return new Promise((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : 0;
          server.close(() => (port ? resolve(port) : reject(new Error('Could not find a free port.'))));
        });
      });
    }
    
    /** Minimal cookie-aware JSON client, standing in for a browser session. */
    class Client {
      private cookie = '';
      private csrf = '';
    
      constructor(private readonly base: string) {}
    
      async request(method: string, route: string, body?: unknown, options: { csrf?: boolean } = {}): Promise<{ status: number; body: any }> {
        const headers: Record<string, string> = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (this.cookie) headers.Cookie = this.cookie;
        if (options.csrf !== false && this.csrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = this.csrf;
    
        const response = await fetch(this.base + route, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'manual'
        });
        const setCookie = response.headers.getSetCookie?.()[0];
        if (setCookie) this.cookie = setCookie.split(';')[0];
    
        const text = await response.text();
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        return { status: response.status, body: parsed };
      }
    
      async get(route: string) {
        return this.request('GET', route);
      }
    
      /** Fetches a CSRF token for this session, as every page does on load. */
      async startSession(): Promise<void> {
        const { body } = await this.request('GET', '/api/csrf', undefined, { csrf: false });
        this.csrf = body.token;
      }
    
      async signUp(slug: string, businessName: string): Promise<void> {
        await this.startSession();
        const { status, body } = await this.request('POST', '/api/auth/signup', {
          businessName,
          slug,
          ownerName: 'Verify Owner',
          email: `${slug}@example.test`,
          password: 'verify-password-1234',
          timezone: 'UTC'
        });
        equal(status, 201, 'signup should create a workspace');
        this.csrf = body.csrfToken;
      }
    }
    
    async function waitForServer(base: string, timeoutMs = 120_000): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${base}/api/health`);
          if (response.status === 200) return;
        } catch {
          /* not up yet */
        }
        await delay(500);
      }
      throw new Error('The server did not become ready in time.');
    }
    
    async function main(): Promise<void> {
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      const scratch = mkdtempSync(path.join(tmpdir(), 'booktend-verify-'));
      let server: ChildProcess | undefined;
    
      console.log(`Scratch copy: ${scratch}`);
      console.log(`Database:     ${databaseName}`);
      console.log(`Server:       ${base}\n`);
    
      try {
        execFileSync('rsync', ['-a', '--exclude', 'node_modules', '--exclude', '.next', '--exclude', '.git', `${projectRoot}/`, `${scratch}/`]);
        symlinkSync(path.join(projectRoot, 'node_modules'), path.join(scratch, 'node_modules'));
      } catch (error) {
        console.error('Could not prepare the scratch copy.', error);
        process.exitCode = 1;
        return;
      }
    
      try {
        server = spawn('npx', ['next', 'dev', '-p', String(port)], {
          cwd: scratch,
          env: { ...process.env, PORT: String(port), MONGODB_DATABASE: databaseName, NODE_ENV: 'development' },
          stdio: ['ignore', 'pipe', 'pipe']
        });
        server.stdout?.on('data', () => {});
        server.stderr?.on('data', () => {});
    
        await waitForServer(base);
        console.log('Server is ready. Running checks...\n');
    
        const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
        const slugA = `verify-a-${stamp}`;
        const slugB = `verify-b-${stamp}`;
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const booking = { customer: 'Amara Okafor', email: 'amara@example.test', phone: '+2348000000000', service: 'Home cleaning', date: tomorrow, notes: '' };
    
        const staffA = new Client(base);
        const staffB = new Client(base);
        let referenceA = '';
        let jobCountA = 0;
    
        const checks: Check[] = [
          check('health reports the database is reachable', async () => {
            const { status, body } = await staffA.get('/api/health');
            equal(status, 200, 'health should return 200');
            ok(['ok', 'degraded'].includes(body.status), `unexpected health status ${body.status}`);
          }),
    
          check('a visitor gets a CSRF token', async () => {
            const client = new Client(base);
            await client.startSession();
            const { body } = await client.get('/api/csrf');
            ok(typeof body.token === 'string' && body.token.length > 20, 'csrf token should be a long string');
          }),
    
          check('signing up creates a workspace and a session', async () => {
            await staffA.signUp(slugA, 'Verify A Co');
            const { status, body } = await staffA.get('/api/auth/me');
            equal(status, 200, 'me should return the new session');
            equal(body.user.role, 'owner', 'the signer is the owner');
            equal(body.business.slug, slugA, 'the session is scoped to the new workspace');
          }),
    
          check('unauthenticated staff routes are rejected', async () => {
            const { status } = await new Client(base).get('/api/jobs');
            equal(status, 401, 'jobs list should require a session');
          }),
    
          check('a mutation without a CSRF token is rejected', async () => {
            const client = new Client(base);
            await client.startSession();
            const { status } = await client.request('POST', '/api/jobs', booking, { csrf: false });
            equal(status, 403, 'mutations should require the CSRF header');
          }),
    
          check('the owner can create a booking', async () => {
            const { status, body } = await staffA.request('POST', '/api/jobs', booking);
            equal(status, 201, 'booking should be created');
            ok(String(body.job._id).startsWith('JF-'), `unexpected reference ${body.job._id}`);
            equal(body.job.status, 'New', 'a new booking starts as New');
            equal(body.job.statusHistory.length, 1, 'the first status is recorded');
            referenceA = body.job._id;
          }),
    
          check('a booking with an invalid email is rejected', async () => {
            const { status, body } = await staffA.request('POST', '/api/jobs', { ...booking, email: 'nope' });
            equal(status, 400, 'validation should fail');
            ok(body.details, 'the failure explains which field is wrong');
          }),
    
          check('a booking in the past is rejected', async () => {
            const { status } = await staffA.request('POST', '/api/jobs', { ...booking, date: yesterday });
            equal(status, 400, 'past dates should be refused');
          }),
    
          check('paging returns every job exactly once', async () => {
            for (let index = 0; index < 5; index += 1) {
              const { status } = await staffA.request('POST', '/api/jobs', {
                ...booking,
                customer: `Customer ${index}`,
                email: `customer${index}@example.test`
              });
              equal(status, 201, 'booking should be created');
            }
            jobCountA = 6;
    
            const seen: string[] = [];
            let cursor: string | null = null;
            let pages = 0;
            do {
              const route = `/api/jobs?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
              const { status, body } = await staffA.get(route);
              equal(status, 200, 'the jobs page should load');
              seen.push(...body.jobs.map((job: { _id: string }) => job._id));
              cursor = body.nextCursor;
              pages += 1;
              ok(pages < 10, 'paging should finish');
            } while (cursor);
    
            equal(seen.length, jobCountA, 'every job should be returned');
            equal(new Set(seen).size, jobCountA, 'a job must not appear on two pages');
          }),
    
          check('an invalid cursor is rejected', async () => {
            const { status } = await staffA.get('/api/jobs?limit=2&cursor=not-a-cursor');
            equal(status, 400, 'a malformed cursor should be a 400');
          }),
    
          check('status changes are recorded in the history', async () => {
            const { status, body } = await staffA.request('PATCH', `/api/jobs/${referenceA}/status`, { status: 'Completed' });
            equal(status, 200, 'the status should change');
            equal(body.job.status, 'Completed', 'the new status is stored');
            equal(body.job.statusHistory.length, 2, 'the change is appended to the history');
          }),
    
          check('the status filter narrows the job list', async () => {
            const { body } = await staffA.get('/api/jobs?limit=50&status=Completed');
            equal(body.jobs.length, 1, 'exactly one job is completed');
          }),
    
          check('the overview counts jobs by status', async () => {
            const { status, body } = await staffA.get('/api/overview');
            equal(status, 200, 'the overview should load');
            equal(body.counts.Completed, 1, 'one completed job');
            equal(body.counts.New, jobCountA - 1, 'the rest are new');
          }),
    
          check('customers are aggregated one row per email', async () => {
            const { status, body } = await staffA.get('/api/customers');
            equal(status, 200, 'customers should load');
            equal(body.customers.length, jobCountA, 'each distinct email is one customer');
          }),
    
          check('clicking a customer returns their contact details and history', async () => {
            const created = await staffA.request('POST', '/api/jobs', { ...booking, service: 'Home cleaning', notes: 'Second visit' });
            equal(created.status, 201, 'a repeat booking for the same email should be accepted');

            const { status, body } = await staffA.get(`/api/customers/${encodeURIComponent(booking.email)}`);
            equal(status, 200, 'the customer detail should load');
            equal(body.customer.customer, booking.customer, 'the name comes back');
            equal(body.customer.email, booking.email, 'the email comes back');
            equal(body.customer.phone, booking.phone, 'the phone comes back');
            equal(body.customer.count, 2, 'both bookings for this email are counted');
            equal(body.jobs.length, 2, 'the history lists every booking for this email');
            ok(body.jobs.every((job: { email: string }) => job.email === booking.email), 'the history must not mix in another customer');
            ok(body.customer.firstBookingAt, 'the customer since date is present');
          }),

          check('customer details require a session', async () => {
            const anonymous = await new Client(base).get(`/api/customers/${encodeURIComponent(booking.email)}`);
            equal(anonymous.status, 401, 'customer details are not public');
          }),

          check('an unknown customer is a 404', async () => {
            const missing = await staffA.get('/api/customers/nobody%40example.test');
            equal(missing.status, 404, 'a customer with no bookings does not exist');
          }),

          check('the owner can edit the service list', async () => {
            const { status, body } = await staffA.request('PUT', '/api/services', { services: ['Gutter clearing', 'Window washing'] });
            equal(status, 200, 'the owner may edit services');
            equal(body.services.length, 2, 'the new list is stored');
          }),
    
          check('a second workspace cannot see or touch the first one', async () => {
            await staffB.signUp(slugB, 'Verify B Co');
    
            const jobs = await staffB.get('/api/jobs?limit=50');
            equal(jobs.body.jobs.length, 0, "another workspace's jobs must not be listed");
    
            const patch = await staffB.request('PATCH', `/api/jobs/${referenceA}/status`, { status: 'Scheduled' });
            equal(patch.status, 404, "another workspace must not be able to change this job");
    
            const customer = await staffB.get(`/api/customers/${encodeURIComponent(booking.email)}`);
            equal(customer.status, 404, "another workspace cannot read this customer's details");

            const services = await staffB.get('/api/services');
            ok(!services.body.services.includes('Gutter clearing'), 'service lists are per workspace');
          }),
    
          check('a booking reference is never reused across workspaces', async () => {
            const created = await staffB.request('POST', '/api/jobs', booking);
            equal(created.status, 201, 'the second workspace can book');
            ok(created.body.job._id !== referenceA, 'references are unique across workspaces');
          }),
    
          check('the public booking page shows the workspace', async () => {
            const { status, body } = await new Client(base).get(`/api/public/business/${slugA}`);
            equal(status, 200, 'the public page should load');
            equal(body.slug, slugA, 'the right workspace is returned');
          }),
    
          check('an anonymous visitor can request a service', async () => {
            const visitor = new Client(base);
            // The owner changed the service list earlier, so book what is offered now.
            const page = await visitor.get(`/api/public/business/${slugA}`);
            await visitor.startSession();
            const offered = page.body.services[0];
            const { status, body } = await visitor.request('POST', `/api/public/bookings/${slugA}`, { ...booking, service: offered });
            equal(status, 201, 'a visitor should be able to book');
            ok(String(body.reference).startsWith('JF-'), 'the visitor gets a reference');
          }),
    
          check('an anonymous booking for an unoffered service is rejected', async () => {
            const visitor = new Client(base);
            await visitor.startSession();
            const { status } = await visitor.request('POST', `/api/public/bookings/${slugA}`, { ...booking, service: 'Not offered' });
            equal(status, 400, 'only offered services are accepted');
          }),
    
          check('an unknown workspace is a 404', async () => {
            const { status } = await new Client(base).get('/api/public/business/does-not-exist');
            equal(status, 404, 'unknown workspaces should 404');
          })
        ];
    
        for (const item of checks) {
          try {
            await item.run();
            results.push({ name: item.name });
            console.log(`  PASS  ${item.name}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            results.push({ name: item.name, error: message });
            console.log(`  FAIL  ${item.name}\n        ${message}`);
          }
        }
      } finally {
        // Let the server finish shutting down before the scratch directory is removed,
        // otherwise it can still be writing .next as we delete it.
        if (server && server.exitCode === null) {
          const exited = new Promise<void>((resolve) => server!.once('exit', () => resolve()));
          server.kill('SIGTERM');
          await Promise.race([exited, delay(5_000, undefined, { ref: false })]);
        }
        try {
          const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
          const connection = await mongoose.createConnection(`${uri}/${databaseName}`).asPromise();
          await connection.dropDatabase();
          await connection.close();
        } catch (error) {
          console.error('Could not drop the scratch database.', error instanceof Error ? error.message : error);
        }
        rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    
      const failed = results.filter((result) => result.error);
      console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
      if (failed.length) {
        console.log('Failed:');
        for (const failure of failed) console.log(`  - ${failure.name}: ${failure.error}`);
        process.exitCode = 1;
      }
    }
    
    void main();
    