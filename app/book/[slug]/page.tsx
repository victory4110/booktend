'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import '@/styles/dashboard.css';
import '@/styles/booking.css';
import { api, refreshCsrf } from '@/services/api';

interface Business {
  name: string;
  slug: string;
  timezone: string;
  services: string[];
}

function todayIn(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export default function BookingPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = decodeURIComponent(params.slug ?? '');
  const requestedService = searchParams.get('service') ?? '';

  const [business, setBusiness] = useState<Business | null>(null);
  const [selectedService, setSelectedService] = useState(requestedService);
  const [minDate, setMinDate] = useState('');
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ message: string; reference: string } | null>(null);

  useEffect(() => {
    document.body.classList.add('booking-page');
    return () => document.body.classList.remove('booking-page');
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!slug) throw new Error('This booking link is missing its workspace name.');
        await refreshCsrf();
        const data = await api<Business>(`/api/public/business/${encodeURIComponent(slug)}`);
        if (!active) return;
        setBusiness(data);
        setMinDate(todayIn(data.timezone));
        if (requestedService) {
          const match = data.services.find((s) => s.toLowerCase() === requestedService.toLowerCase());
          if (match) setSelectedService(match);
        }
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'The booking page is unavailable.');
        setDisabled(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const values = new FormData(event.currentTarget);
    const body = Object.fromEntries(['customer', 'email', 'phone', 'service', 'date', 'notes'].map((key) => [key, String(values.get(key) ?? '')]));
    try {
      await refreshCsrf();
      const result = await api<{ message: string; reference: string }>(`/api/public/bookings/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setSuccess(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const services = business?.services ?? ['Home cleaning', 'Appliance repair', 'Plumbing', 'Electrical work', 'Other'];

  return (
    <>
      <header className="booking-header">
        <a className="brand" href={`/book/${encodeURIComponent(slug)}`}>
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
        <a className="staff-link" href="/">
          Staff sign in <span>→</span>
        </a>
      </header>

      <main className="booking-layout">
        <section className="booking-copy">
          <p className="eyebrow">BOOK A SERVICE</p>
          <h1>
            Let’s get it
            <br />
            taken care of.
          </h1>
          <p>Tell us what you need and choose a day that works. Our team will follow up to confirm the details.</p>
          <div className="booking-promise">
            <span>✓</span>
            <span>
              <strong>Simple, clear booking</strong>
              <small>Your request goes straight to our service team.</small>
            </span>
          </div>
          <div className="booking-promise">
            <span>◷</span>
            <span>
              <strong>We’ll confirm with you</strong>
              <small>We’ll get in touch to arrange the visit.</small>
            </span>
          </div>
        </section>

        <section className="public-form-card">
          <div className="public-form-heading">
            <span className="business-avatar">✳</span>
            <div>
              <h2 id="businessName">{business?.name ?? 'Booktend'}</h2>
              <p>Service request form</p>
            </div>
          </div>

          {success ? (
            <div className="booking-success">
              <span className="success-mark">✓</span>
              <p className="eyebrow">REQUEST SENT</p>
              <h2>You’re all set.</h2>
              <p>{success.message}</p>
              <p className="reference">
                Reference <strong>{success.reference}</strong>
              </p>
              <a className="button button-light" href={`/book/${encodeURIComponent(slug)}`}>
                Make another booking
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="form-field full-field">
                  Your name
                  <input name="customer" required minLength={2} maxLength={100} autoComplete="name" placeholder="e.g. Amara Okafor" />
                </label>
                <label className="form-field">
                  Email address
                  <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" />
                </label>
                <label className="form-field">
                  Phone number
                  <input name="phone" type="tel" required minLength={7} maxLength={30} autoComplete="tel" placeholder="+234 800 000 0000" />
                </label>
                <label className="form-field full-field">
                  What service do you need?
                  <select name="service" required value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
                    <option value="">Choose a service</option>
                    {services.map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field full-field">
                  Preferred date
                  <input name="date" type="date" required min={minDate} />
                </label>
                <label className="form-field full-field">
                  Anything else we should know?
                  <textarea name="notes" rows={3} maxLength={2000} placeholder="Share a few details about the job…" />
                </label>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                  {disabled && (
                    <>
                      {' '}
                      <Link href="/book">Find a service provider →</Link>
                    </>
                  )}
                </p>
              )}
              <button className="button button-dark submit-booking" type="submit" disabled={disabled || busy}>
                Send service request <span>→</span>
              </button>
              <p className="privacy-note">By sending this request, you agree that the business may contact you about this booking.</p>
            </form>
          )}
        </section>
      </main>

      <footer className="booking-footer">
        <span>© 2026 Booktend</span>
        <span>Service booking, made simpler.</span>
      </footer>
    </>
  );
}
