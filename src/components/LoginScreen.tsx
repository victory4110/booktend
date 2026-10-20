'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, refreshCsrf, setCsrfToken } from '@/services/api';
import type { SessionUser, Workspace } from '@/lib/types';

const WORKSPACE_KEY = 'booktend.workspaceSlug';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function Logo({ className }: { className: string }) {
  return (
    <a className={className} href="/" aria-label="Booktend home">
      <span className="brand-mark">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" />
          <path d="M12.5 16h15v14h-15zM16 12.5v6M24 12.5v6M12.5 20h15" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="m17 25 2.5 2.5 5-5" fill="none" stroke="#c9e4b7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
        </svg>
      </span>
      <span>
        booktend<span className="brand-period">.</span>
      </span>
    </a>
  );
}

export default function LoginScreen({ onSignedIn }: { onSignedIn: (user: SessionUser, workspace: Workspace) => void }) {
  const [panel, setPanel] = useState<'login' | 'signup'>('login');
  const [loginSlug, setLoginSlug] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [signupSlug, setSignupSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [signupBusy, setSignupBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_KEY);
      if (saved) setLoginSlug(saved);
    } catch {
      /* storage may be disabled; let the user type the slug */
    }
  }, []);

  function rememberWorkspaceSlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(normalized)) return;
    try {
      localStorage.setItem(WORKSPACE_KEY, normalized);
    } catch {
      /* ignore */
    }
  }

  function onBusinessNameChange(value: string) {
    setBusinessName(value);
    if (!slugEdited) {
      setSignupSlug(
        value
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60)
      );
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError('');
    setLoginBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await refreshCsrf();
      const result = await api<{ user: SessionUser; business: Workspace; csrfToken: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ slug: values.get('slug'), email: values.get('email'), password: values.get('password') })
      });
      setCsrfToken(result.csrfToken);
      rememberWorkspaceSlug(result.business.slug);
      onSignedIn(result.user, result.business);
    } catch (cause) {
      setLoginError(cause instanceof Error ? cause.message : 'Sign in failed.');
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignupError('');
    setSignupBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await refreshCsrf();
      const payload = Object.fromEntries(
        ['businessName', 'slug', 'ownerName', 'email', 'password', 'timezone'].map((key) => [key, String(values.get(key) ?? '')])
      );
      const result = await api<{ user: SessionUser; business: Workspace; csrfToken: string }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setCsrfToken(result.csrfToken);
      rememberWorkspaceSlug(result.business.slug);
      onSignedIn(result.user, result.business);
    } catch (cause) {
      setSignupError(cause instanceof Error ? cause.message : 'Could not create your workspace.');
    } finally {
      setSignupBusy(false);
    }
  }

  return (
    <main className="login-screen" id="loginScreen">
      <div className="login-inner">
        <section className="login-story" aria-labelledby="loginStoryTitle">
        <Logo className="brand story-brand" />
        <div className="story-copy">
          <p className="story-kicker">
            <span></span> SERVICE WORK, IN SYNC
          </p>
          <h2 id="loginStoryTitle">
            Good work starts with a <em>clear day.</em>
          </h2>
          <p className="story-description">Keep every request, appointment, and job moving from one calm workspace.</p>
          <div className="story-points">
            <span>
              <b>✓</b> Bookings in one place
            </span>
            <span>
              <b>✓</b> Your team always in sync
            </span>
          </div>
        </div>
        <div className="preview-card" aria-hidden="true">
          <div className="preview-top">
            <span>
              <i></i> TODAY AT A GLANCE
            </span>
            <b>•••</b>
          </div>
          <div className="preview-title">
            The day, in good shape <span>↗</span>
          </div>
          <div className="preview-stats">
            <div>
              <small>NEW REQUESTS</small>
              <strong>04</strong>
            </div>
            <div>
              <small>ON THE SCHEDULE</small>
              <strong>08</strong>
            </div>
            <div>
              <small>COMPLETED</small>
              <strong>12</strong>
            </div>
          </div>
          <div className="preview-divider"></div>
          <div className="preview-job">
            <span className="preview-job-icon">✳</span>
            <span>
              <b>Morning bookings</b>
              <small>Everything your team needs to get moving.</small>
            </span>
            <span className="preview-status">ON TRACK</span>
          </div>
        </div>
        <p className="story-footer">A little more order in every workday.</p>
      </section>

      <div className="auth-column">
        <section className="login-card" id="loginPanel" hidden={panel !== 'login'}>
          <Logo className="brand login-brand" />
          <p className="eyebrow">STAFF WORKSPACE</p>
          <h1>Welcome back</h1>
          <p className="login-intro">Enter your workspace and sign-in details.</p>
          <form className="login-form" onSubmit={handleLogin}>
            <label className="form-field">
              Workspace URL slug
              <input
                type="text"
                name="slug"
                autoComplete="organization"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="e.g. oak-and-alder"
                value={loginSlug}
                onChange={(event) => setLoginSlug(event.target.value)}
              />
              <small className="field-hint">
                The part after <code>/book/</code> in your public booking link.
              </small>
            </label>
            <label className="form-field">
              Email address
              <input type="email" name="email" autoComplete="username" required placeholder="you@yourbusiness.com" />
            </label>
            <label className="form-field">
              Password
              <input type="password" name="password" autoComplete="current-password" required placeholder="Enter your password" />
            </label>
            {loginError && (
              <p className="form-error" role="alert">
                {loginError}
              </p>
            )}
            <button className="button button-dark" type="submit" disabled={loginBusy}>
              Sign in <span>→</span>
            </button>
          </form>
          <p className="login-foot">
            New to Booktend?{' '}
            <button className="auth-switch" type="button" onClick={() => setPanel('signup')}>
              Create a business workspace
            </button>
          </p>
          <p className="login-foot directory-callout">
            Looking to book a service?{' '}
            <Link href="/book">Find a service provider →</Link>
          </p>
        </section>

        <section className="login-card signup-card" id="signupPanel" hidden={panel !== 'signup'}>
          <Logo className="brand login-brand" />
          <p className="eyebrow">GET STARTED</p>
          <h1>Create your workspace</h1>
          <p className="login-intro">Set up Booktend for your service business.</p>
          <form className="login-form" onSubmit={handleSignup}>
            <label className="form-field">
              Business name
              <input
                type="text"
                name="businessName"
                required
                minLength={2}
                maxLength={100}
                autoComplete="organization"
                placeholder="e.g. Oak & Alder"
                value={businessName}
                onChange={(event) => onBusinessNameChange(event.target.value)}
              />
            </label>
            <label className="form-field">
              Booking page URL slug
              <div className="slug-input">
                <span>/book/</span>
                <input
                  type="text"
                  name="slug"
                  required
                  minLength={2}
                  maxLength={60}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="oak-and-alder"
                  value={signupSlug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSignupSlug(event.target.value);
                  }}
                />
              </div>
            </label>
            <output className="slug-preview">
              Your booking page: <strong>/book/{signupSlug || 'your-business'}</strong>
            </output>
            <label className="form-field">
              Your name
              <input type="text" name="ownerName" required minLength={2} maxLength={100} autoComplete="name" placeholder="Your name" />
            </label>
            <label className="form-field">
              Business email
              <input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="you@yourbusiness.com" />
            </label>
            <label className="form-field">
              Password
              <input type="password" name="password" required minLength={12} maxLength={200} autoComplete="new-password" placeholder="At least 12 characters" />
            </label>
            <label className="form-field">
              Business time zone
              <select name="timezone" required defaultValue="Africa/Lagos">
                <option value="Africa/Lagos">West Africa Time (Lagos)</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">United Kingdom (London)</option>
                <option value="America/New_York">US Eastern (New York)</option>
              </select>
            </label>
            {signupError && (
              <p className="form-error" role="alert">
                {signupError}
              </p>
            )}
            <button className="button button-dark" type="submit" disabled={signupBusy}>
              Create workspace <span>→</span>
            </button>
          </form>
          <p className="login-foot">
            Already have a workspace?{' '}
            <button className="auth-switch" type="button" onClick={() => setPanel('login')}>
              Sign in
            </button>
          </p>
          <p className="login-foot directory-callout">
            Looking to book a service?{' '}
            <Link href="/book">Find a service provider →</Link>
          </p>
        </section>
      </div>
      </div>
      <p className="login-caption">A calmer way to keep work moving.</p>
    </main>
  );
}
