'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import '@/styles/dashboard.css';
import '@/styles/booking.css';
import { api } from '@/services/api';
import { initials } from '@/lib/format';

interface PublicBusiness {
  name: string;
  slug: string;
  timezone: string;
  services: string[];
}

interface DirectoryResponse {
  businesses: PublicBusiness[];
  services: string[];
}

export default function DirectoryPage() {
  const [businesses, setBusinesses] = useState<PublicBusiness[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('booking-page');
    return () => document.body.classList.remove('booking-page');
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api<DirectoryResponse>('/api/public/businesses');
        if (!active) return;
        setBusinesses(data.businesses);
        setAvailableServices(data.services);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Could not load service providers.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const s = selectedService.trim().toLowerCase();
    return businesses.filter((b) => {
      if (s && !b.services.some((svc) => svc.toLowerCase() === s)) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        b.services.some((svc) => svc.toLowerCase().includes(q))
      );
    });
  }, [businesses, query, selectedService]);

  const hasFilters = Boolean(query.trim() || selectedService);

  return (
    <>
      <header className="booking-header">
        <Link className="brand" href="/">
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
        </Link>
        <Link className="staff-link" href="/">
          Staff sign in <span>→</span>
        </Link>
      </header>

      <main className="directory-layout">
        <section className="directory-hero">
          <p className="eyebrow">FIND A SERVICE PROVIDER</p>
          <h1>Book the service you need.</h1>
          <p className="directory-sub">
            Search businesses on Booktend by service or name, then send your booking request in seconds.
          </p>

          <div className="directory-controls">
            <label className="directory-search">
              <span className="directory-search-icon" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by service (e.g. Plumbing, Home cleaning) or business name…"
                aria-label="Search by service or business name"
              />
              {query && (
                <button
                  type="button"
                  className="directory-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </label>

            {availableServices.length > 0 && (
              <div className="directory-pills" role="group" aria-label="Filter by service">
                <button
                  type="button"
                  className={`service-pill${selectedService === '' ? ' active' : ''}`}
                  onClick={() => setSelectedService('')}
                >
                  All services
                </button>
                {availableServices.slice(0, 12).map((service) => {
                  const isActive = selectedService.toLowerCase() === service.toLowerCase();
                  return (
                    <button
                      key={service}
                      type="button"
                      className={`service-pill${isActive ? ' active' : ''}`}
                      onClick={() => setSelectedService(isActive ? '' : service)}
                    >
                      {service}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="directory-results" aria-live="polite">
          {loading ? (
            <div className="directory-empty">
              <span>✳</span>
              <strong>Looking up service providers…</strong>
              <p>Loading available businesses on Booktend.</p>
            </div>
          ) : error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : filtered.length === 0 ? (
            <div className="directory-empty">
              <span>✳</span>
              <strong>No matching businesses found</strong>
              <p>
                {hasFilters
                  ? 'Try another service keyword or clear your filters to browse every provider.'
                  : 'No businesses have set up a public workspace yet.'}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  className="button button-light"
                  onClick={() => {
                    setQuery('');
                    setSelectedService('');
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="directory-meta">
                <span>
                  Showing <strong>{filtered.length}</strong> {filtered.length === 1 ? 'business' : 'businesses'}
                  {selectedService ? ` offering "${selectedService}"` : ''}
                </span>
                {hasFilters && (
                  <button
                    type="button"
                    className="filter-reset"
                    onClick={() => {
                      setQuery('');
                      setSelectedService('');
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              <div className="directory-grid">
                {filtered.map((item) => (
                  <article key={item.slug} className="directory-card">
                    <div className="directory-card-head">
                      <span className="business-avatar">{initials(item.name) || '✳'}</span>
                      <div className="directory-card-title">
                        <h2>{item.name}</h2>
                        <small>/book/{item.slug}</small>
                      </div>
                    </div>

                    <div className="directory-card-services">
                      <span className="directory-services-label">SERVICES OFFERED</span>
                      <div className="directory-tags">
                        {item.services.map((svc) => (
                          <button
                            key={svc}
                            type="button"
                            className={`directory-tag${selectedService.toLowerCase() === svc.toLowerCase() ? ' active' : ''}`}
                            onClick={() => setSelectedService( svc === selectedService ? '' : svc )}
                            title={`Filter by ${svc}`}
                          >
                            {svc}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="directory-card-foot">
                      <span className="directory-tz">{item.timezone}</span>
                      <Link
                        className="button button-dark directory-book-btn"
                        href={`/book/${encodeURIComponent(item.slug)}${selectedService ? `?service=${encodeURIComponent(selectedService)}` : ''}`}
                      >
                        Book service <span>→</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
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
