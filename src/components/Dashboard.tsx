'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type WorkspaceView } from '@/components/AppShell';
import { useSession } from '@/components/SessionContext';
import { api, ApiError } from '@/services/api';
import { phoneHref, whatsappHref } from '@/lib/contact';
import { jobsToCsv } from '@/lib/csv';
import { formatDate, initials, statusClass } from '@/lib/format';
import { type Customer, type CustomerDetail, type Job, type Overview, STATUSES, type Status } from '@/lib/types';

type View = WorkspaceView;
type SortColumn = 'id' | 'customer' | 'service' | 'date' | 'status';
type SortDirection = 'asc' | 'desc';
type DatePreset = 'all' | 'today' | 'upcoming' | 'past' | 'recent-30';
const SCHEDULE_TIMES = ['9:30 AM', '11:00 AM', '2:15 PM'];

function filterJobs(list: Job[], search: string, status: string): Job[] {
  const query = search.trim().toLowerCase();
  return list.filter(
    (job) => (status === 'all' || job.status === status) && `${job._id} ${job.customer} ${job.email} ${job.service}`.toLowerCase().includes(query)
  );
}

export default function Dashboard() {
  // The layout owns the account and the current tab, so the chrome survives
  // navigation between the dashboard and the profile page.
  const { user, workspace, view, setView, setJobCount, signOut } = useSession();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [today, setToday] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Status, number>>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);

  const loadedTabs = useRef<Set<string>>(new Set());

  const [jobSearch, setJobSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [allJobSearch, setAllJobSearch] = useState('');
  const [allStatusFilter, setAllStatusFilter] = useState('all');
  const [allServiceFilter, setAllServiceFilter] = useState('all');
  const [allDateFilter, setAllDateFilter] = useState<DatePreset>('all');
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [customerDetailError, setCustomerDetailError] = useState('');
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);

  const [servicesInput, setServicesInput] = useState('');
  const [publicListed, setPublicListed] = useState(true);
  const [servicesError, setServicesError] = useState('');
  const [servicesBusy, setServicesBusy] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [contactCopied, setContactCopied] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const customerDialogRef = useRef<HTMLDialogElement>(null);
  // Guards against a slow response for a previously clicked customer
  // overwriting the one the user is actually looking at.
  const customerRequest = useRef(0);
  const bookingFormRef = useRef<HTMLFormElement>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingMinDate, setBookingMinDate] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contactCopyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const totalJobs = useMemo(() => Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0), [counts]);

  useEffect(() => {
    setJobCount(totalJobs);
  }, [totalJobs, setJobCount]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const guard = useCallback(
    (error: unknown): never => {
      if (error instanceof ApiError && error.status === 401) void signOut();
      throw error;
    },
    [signOut]
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const overview = await api<Overview>('/api/overview');
      setRecentJobs(overview.recent);
      setToday(overview.today);
      setCounts(overview.counts);
      loadedTabs.current.add('overview');
    } catch (error) {
      guard(error);
    } finally {
      setOverviewLoading(false);
    }
  }, [guard]);

  const loadJobsTab = useCallback(async () => {
    setJobsLoading(true);
    try {
      const jobsPage = await api<{ jobs: Job[]; nextCursor: string | null }>('/api/jobs?limit=200');
      setJobs(jobsPage.jobs);
      setNextCursor(jobsPage.nextCursor);
      loadedTabs.current.add('jobs');
    } catch (error) {
      guard(error);
    } finally {
      setJobsLoading(false);
    }
  }, [guard]);

  const loadCustomersTab = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const customerPage = await api<{ customers: Customer[] }>('/api/customers');
      setCustomers(customerPage.customers);
      loadedTabs.current.add('customers');
    } catch (error) {
      guard(error);
    } finally {
      setCustomersLoading(false);
    }
  }, [guard]);

  const loadServicesTab = useCallback(async () => {
    setServicesLoading(true);
    try {
      const servicePage = await api<{ services: string[]; publicListed?: boolean }>('/api/services');
      setServices(servicePage.services);
      setServicesInput(servicePage.services.join('\n'));
      setPublicListed(servicePage.publicListed !== false);
      loadedTabs.current.add('services');
    } catch (error) {
      guard(error);
    } finally {
      setServicesLoading(false);
    }
  }, [guard]);

  const refreshLoadedTabs = useCallback(async () => {
    const tasks: Promise<void>[] = [loadOverview()];
    if (loadedTabs.current.has('jobs')) tasks.push(loadJobsTab());
    if (loadedTabs.current.has('customers')) tasks.push(loadCustomersTab());
    await Promise.all(tasks);
  }, [loadOverview, loadJobsTab, loadCustomersTab]);

  useEffect(() => {
    if (view === 'overview' && !loadedTabs.current.has('overview')) void loadOverview();
    else if (view === 'jobs' && !loadedTabs.current.has('jobs')) void loadJobsTab();
    else if (view === 'customers' && !loadedTabs.current.has('customers')) void loadCustomersTab();
    else if (view === 'services' && !loadedTabs.current.has('services')) void loadServicesTab();
  }, [view, loadOverview, loadJobsTab, loadCustomersTab, loadServicesTab]);


  useEffect(() => {
    // A click on a row's trigger or inside its menu must not close that menu.
    // React handlers cannot stop this listener with stopPropagation (the event
    // still reaches document), so decide by where the click landed instead.
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.row-menu, .row-menu-pop')) return;
      setOpenMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  function switchView(next: View) {
    setView(next);
  }

  function openBookingDialog() {
    if (!loadedTabs.current.has('services') && !servicesLoading) {
      void loadServicesTab();
    }
    const now = new Date();
    const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 86400000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setBookingMinDate(localToday);
    setBookingDate(tomorrow);
    dialogRef.current?.showModal();
  }

  async function handleCopyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setContactCopied(true);
      if (contactCopyTimer.current) clearTimeout(contactCopyTimer.current);
      contactCopyTimer.current = setTimeout(() => setContactCopied(false), 1800);
      showToast('Phone number copied.');
    } catch {
      showToast('Could not copy the number. Select it and copy it manually.');
    }
  }

  async function handleStatusChange(job: Job, status: Status) {
    setOpenMenuId(null);
    try {
      await api(`/api/jobs/${encodeURIComponent(job._id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refreshLoadedTabs();
      showToast(`${job._id} marked ${status.toLowerCase()}.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return void signOut();
      showToast(cause instanceof Error ? cause.message : 'Could not update the job.');
    }
  }

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api<{ jobs: Job[]; nextCursor: string | null }>(`/api/jobs?limit=200&cursor=${encodeURIComponent(nextCursor)}`);
      setJobs((current) => [...current, ...page.jobs]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return void signOut();
      showToast(cause instanceof Error ? cause.message : 'Could not load more jobs.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBookingBusy(true);
    const values = new FormData(event.currentTarget);
    const input = Object.fromEntries(['customer', 'email', 'phone', 'service', 'date', 'notes'].map((key) => [key, String(values.get(key) ?? '')]));
    try {
      const result = await api<{ job: Job; notificationsQueued: boolean }>('/api/jobs', { method: 'POST', body: JSON.stringify(input) });
      bookingFormRef.current?.reset();
      dialogRef.current?.close();
      await refreshLoadedTabs();
      switchView('overview');
      showToast(result.notificationsQueued ? 'Booking created and notifications queued.' : 'Booking created; email notifications are not configured.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return void signOut();
      showToast(cause instanceof Error ? cause.message : 'Could not create booking.');
    } finally {
      setBookingBusy(false);
    }
  }

  async function handleTogglePublicListed(nextValue: boolean) {
    setPublicListed(nextValue);
    setServicesError('');
    try {
      const result = await api<{ services: string[]; publicListed: boolean }>('/api/services', {
        method: 'PUT',
        body: JSON.stringify({ publicListed: nextValue })
      });
      setPublicListed(result.publicListed);
      showToast(result.publicListed ? 'Workspace listed in the public directory.' : 'Workspace hidden from the public directory.');
    } catch (cause) {
      setPublicListed(!nextValue);
      if (cause instanceof ApiError && cause.status === 401) return void signOut();
      setServicesError(cause instanceof Error ? cause.message : 'Could not update directory visibility.');
    }
  }

  async function handleServicesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServicesError('');
    const submitted = servicesInput
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!submitted.length || submitted.length > 30 || submitted.some((item) => item.length < 2 || item.length > 80)) {
      setServicesError('Add between 1 and 30 services. Each service must be 2–80 characters.');
      return;
    }
    if (new Set(submitted.map((item) => item.toLocaleLowerCase())).size !== submitted.length) {
      setServicesError('Remove duplicate service names before saving.');
      return;
    }
    setServicesBusy(true);
    try {
      const result = await api<{ services: string[]; publicListed: boolean }>('/api/services', {
        method: 'PUT',
        body: JSON.stringify({ services: submitted, publicListed })
      });
      setServices(result.services);
      setServicesInput(result.services.join('\n'));
      setPublicListed(result.publicListed);
      showToast('Services and directory visibility saved.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return void signOut();
      setServicesError(cause instanceof Error ? cause.message : 'Could not save services.');
    } finally {
      setServicesBusy(false);
    }
  }

  async function openCustomer(email: string) {
    const request = customerRequest.current + 1;
    customerRequest.current = request;
    setCustomerDetail(null);
    setCustomerDetailError('');
    setCustomerDetailLoading(true);
    customerDialogRef.current?.showModal();
    try {
      const detail = await api<CustomerDetail>(`/api/customers/${encodeURIComponent(email)}`);
      if (customerRequest.current === request) setCustomerDetail(detail);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) return void signOut();
      if (customerRequest.current === request) setCustomerDetailError(cause instanceof Error ? cause.message : 'Could not load this customer.');
    } finally {
      if (customerRequest.current === request) setCustomerDetailLoading(false);
    }
  }

  const now = new Date();
  const greeting = `${now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'}, ${user.name}`;
  const headingEyebrow = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(now).toUpperCase();

  const recentFiltered = filterJobs(recentJobs, jobSearch, statusFilter);

  const availableServices = useMemo(() => {
    const set = new Set<string>(services);
    for (const job of jobs) {
      if (job.service) set.add(job.service);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [services, jobs]);

  const hasActiveFilters = Boolean(
    allJobSearch.trim() ||
    allStatusFilter !== 'all' ||
    allServiceFilter !== 'all' ||
    allDateFilter !== 'all'
  );

  const clearAllFilters = useCallback(() => {
    setAllJobSearch('');
    setAllStatusFilter('all');
    setAllServiceFilter('all');
    setAllDateFilter('all');
  }, []);

  const toggleSort = useCallback((column: SortColumn) => {
    setSortColumn((currentCol) => {
      if (currentCol === column) {
        setSortDirection((currentDir) => (currentDir === 'asc' ? 'desc' : 'asc'));
        return currentCol;
      }
      setSortDirection(column === 'date' || column === 'id' ? 'desc' : 'asc');
      return column;
    });
  }, []);

  const allFiltered = useMemo(() => {
    const query = allJobSearch.trim().toLowerCase();
    const now = new Date();
    const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const past30 = new Date(now.getTime() - 30 * 86400000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    const filtered = jobs.filter((job) => {
      if (allStatusFilter !== 'all' && job.status !== allStatusFilter) return false;
      if (allServiceFilter !== 'all' && job.service !== allServiceFilter) return false;

      const jobDate = job.date ? job.date.slice(0, 10) : '';
      if (allDateFilter === 'today' && jobDate !== todayIso) return false;
      if (allDateFilter === 'upcoming' && jobDate < todayIso) return false;
      if (allDateFilter === 'past' && jobDate >= todayIso) return false;
      if (allDateFilter === 'recent-30' && (jobDate < past30 || jobDate > todayIso)) return false;

      if (query) {
        const haystack = `${job._id} ${job.customer} ${job.email} ${job.phone} ${job.service} ${job.notes}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'id') {
        const numA = parseInt(a._id.replace(/\D/g, ''), 10);
        const numB = parseInt(b._id.replace(/\D/g, ''), 10);
        comparison = !isNaN(numA) && !isNaN(numB) ? numA - numB : a._id.localeCompare(b._id);
      } else if (sortColumn === 'customer') {
        comparison = a.customer.localeCompare(b.customer, undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'service') {
        comparison = a.service.localeCompare(b.service, undefined, { sensitivity: 'base' });
      } else if (sortColumn === 'date') {
        comparison = (a.date || '').localeCompare(b.date || '');
        if (comparison === 0) {
          const numA = parseInt(a._id.replace(/\D/g, ''), 10);
          const numB = parseInt(b._id.replace(/\D/g, ''), 10);
          comparison = !isNaN(numA) && !isNaN(numB) ? numA - numB : a._id.localeCompare(b._id);
        }
      } else if (sortColumn === 'status') {
        comparison = a.status.localeCompare(b.status);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [jobs, allJobSearch, allStatusFilter, allServiceFilter, allDateFilter, sortColumn, sortDirection]);

  const handleExportCsv = useCallback(() => {
    if (!allFiltered.length) return;
    const csvContent = jobsToCsv(allFiltered);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date();
    const dateStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const slug = workspace?.slug || 'workspace';
    link.setAttribute('href', url);
    link.setAttribute('download', `${slug}-jobs-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${allFiltered.length} ${allFiltered.length === 1 ? 'job' : 'jobs'} to CSV.`);
  }, [allFiltered, workspace?.slug, showToast]);
  const customersFiltered = customers.filter((customer) =>
    `${customer.customer} ${customer.email} ${customer.phone}`.toLowerCase().includes(customerSearch.trim().toLowerCase())
  );

  // The Overview table is a read-only summary, so only the jobs list opens
  // customer details.
  const customerCell = (job: Job, withDetails: boolean) => {
    const content = (
      <>
        <span className="customer-avatar">{initials(job.customer)}</span>
        <span className="customer-copy">
          <strong>{job.customer}</strong>
          <small>{job.email}</small>
        </span>
      </>
    );
    if (!withDetails) return <div className="customer-cell">{content}</div>;
    return (
      <button
        className="customer-cell customer-cell-button"
        type="button"
        onClick={() => void openCustomer(job.email)}
        aria-label={`View customer details for ${job.customer}`}
      >
        {content}
      </button>
    );
  };

  const renderRows = (list: Job[], withCustomerDetails = false) =>
    list.map((job) => (
      <tr key={job._id}>
        <td>
          <span className="job-id">{job._id}</span>
        </td>
        <td>{customerCell(job, withCustomerDetails)}</td>
        <td>
          <span className="service-cell">{job.service}</span>
        </td>
        <td>
          <span className="date-cell">{formatDate(job.date)}</span>
        </td>
        <td>
          <span className={`status-pill ${statusClass(job.status)}`}>{job.status}</span>
        </td>
        <td className="row-actions">
          <button
            className="row-menu"
            aria-label={`Actions for ${job._id}`}
            onClick={() => setOpenMenuId((current) => (current === job._id ? null : job._id))}
          >
            ···
          </button>
          {openMenuId === job._id && (
            <div className="row-menu-pop">
              {STATUSES.filter((status) => status !== job.status).map((status) => (
                <button key={status} type="button" onClick={() => void handleStatusChange(job, status)}>
                  Mark {status.toLowerCase()}
                </button>
              ))}
            </div>
          )}
        </td>
      </tr>
    ));

  const skeletonJobRows = (count: number) =>
    Array.from({ length: count }).map((_, index) => (
      <tr key={`sk-job-${index}`} aria-hidden="true">
        <td>
          <span className="skeleton" style={{ height: 13, width: 54 }} />
        </td>
        <td>
          <div className="customer-cell">
            <span className="skeleton skeleton-avatar" />
            <span className="customer-copy" style={{ gap: 6 }}>
              <span className="skeleton" style={{ height: 11, width: 110 }} />
              <span className="skeleton" style={{ height: 9, width: 150 }} />
            </span>
          </div>
        </td>
        <td>
          <span className="skeleton" style={{ height: 12, width: 82 }} />
        </td>
        <td>
          <span className="skeleton" style={{ height: 12, width: 52 }} />
        </td>
        <td>
          <span className="skeleton skeleton-pill" />
        </td>
        <td />
      </tr>
    ));

  const skeletonCustomerRows = (count: number) =>
    Array.from({ length: count }).map((_, index) => (
      <tr key={`sk-cust-${index}`} aria-hidden="true">
        <td>
          <div className="customer-cell">
            <span className="skeleton skeleton-avatar" />
            <span className="skeleton" style={{ height: 12, width: 120 }} />
          </div>
        </td>
        <td>
          <span className="skeleton" style={{ height: 12, width: 160 }} />
        </td>
        <td>
          <span className="skeleton" style={{ height: 12, width: 110 }} />
        </td>
        <td>
          <span className="skeleton" style={{ height: 12, width: 28 }} />
        </td>
        <td>
          <span className="skeleton" style={{ height: 12, width: 90 }} />
        </td>
      </tr>
    ));

  const metricValue = (value: number) => (overviewLoading ? <span className="skeleton" style={{ height: 30, width: 48, borderRadius: 7 }} /> : value);

  return (
    <>
      <div className="content-wrap">
        <section className={`view${view === 'overview' ? ' active-view' : ''}`}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{headingEyebrow}</p>
              <h1>
                <span>{greeting}</span> <span className="wave">✳</span>
              </h1>
              <p className="heading-sub">Here’s what’s happening with your jobs today.</p>
            </div>
            <button className="button button-dark" onClick={openBookingDialog}>
              <span>＋</span> New booking
            </button>
          </div>

          <div className="metric-grid">
            <article className="metric-card">
              <div className="metric-top">
                <span>Total jobs</span>
                <span className="metric-icon icon-lilac">▤</span>
              </div>
              <div className="metric-value">{metricValue(totalJobs)}</div>
              <div className="metric-foot">Across all bookings</div>
            </article>
            <article className="metric-card">
              <div className="metric-top">
                <span>Needs attention</span>
                <span className="metric-icon icon-peach">◷</span>
              </div>
              <div className="metric-value">{metricValue(counts.New ?? 0)}</div>
              <div className="metric-foot">New requests to review</div>
            </article>
            <article className="metric-card">
              <div className="metric-top">
                <span>In progress</span>
                <span className="metric-icon icon-blue">↗</span>
              </div>
              <div className="metric-value">{metricValue(counts['In progress'] ?? 0)}</div>
              <div className="metric-foot">Jobs currently underway</div>
            </article>
            <article className="metric-card">
              <div className="metric-top">
                <span>Completed</span>
                <span className="metric-icon icon-green">✓</span>
              </div>
              <div className="metric-value">{metricValue(counts.Completed ?? 0)}</div>
              <div className="metric-foot">Service history</div>
            </article>
          </div>

          <section className="panel jobs-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent jobs</h2>
                <p>Your latest bookings and service requests</p>
              </div>
              <button className="text-button" onClick={() => switchView('jobs')}>
                View all jobs <span>→</span>
              </button>
            </div>
            <div className="table-toolbar">
              <label className="search-box">
                <span>⌕</span>
                <input type="search" placeholder="Search jobs or customers…" value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} />
              </label>
              <label className="filter-select">
                <span className="sr-only">Filter jobs by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>JOB</th>
                    <th>CUSTOMER</th>
                    <th>SERVICE</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>{overviewLoading ? skeletonJobRows(4) : renderRows(recentFiltered)}</tbody>
              </table>
            </div>
            {!overviewLoading && recentFiltered.length === 0 && (
              <div className="empty-state">
                <span>▤</span>
                <strong>No jobs found</strong>
                <p>Try another search or add a new booking.</p>
              </div>
            )}
            <div className="panel-footer">
              <span>
                {overviewLoading ? (
                  <span className="skeleton" style={{ height: 11, width: 92 }} />
                ) : (
                  `Showing ${recentFiltered.length} ${recentFiltered.length === 1 ? 'job' : 'jobs'}`
                )}
              </span>
              <span className="muted">Latest requests</span>
            </div>
          </section>

          <div className="lower-grid">
            <section className="panel schedule-panel">
              <div className="panel-heading">
                <div>
                  <h2>Today’s schedule</h2>
                  <p>Your upcoming appointments</p>
                </div>
                <button className="round-more" aria-label="More schedule options">
                  ···
                </button>
              </div>
              <div className="schedule-list">
                {overviewLoading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div className="schedule-item" key={`sk-sched-${index}`} aria-hidden="true">
                      <span className="skeleton" style={{ height: 12, width: 52 }} />
                      <span className="schedule-rail" />
                      <span className="schedule-copy" style={{ gap: 6 }}>
                        <span className="skeleton" style={{ height: 12, width: 150 }} />
                        <span className="skeleton" style={{ height: 10, width: 110 }} />
                      </span>
                      <span className="skeleton skeleton-pill" style={{ width: 54 }} />
                    </div>
                  ))
                ) : today.length === 0 ? (
                  <div className="schedule-empty">No appointments on today’s schedule.</div>
                ) : (
                  today.slice(0, 3).map((job, index) => (
                    <div className="schedule-item" key={job._id}>
                      <span className="schedule-time">{SCHEDULE_TIMES[index]}</span>
                      <span className="schedule-rail"></span>
                      <span className="schedule-copy">
                        <strong>
                          {job.service} · {job.customer}
                        </strong>
                        <span>{job.notes || 'Service appointment'}</span>
                      </span>
                      <span className="schedule-type">{job.status === 'New' ? 'REQUEST' : 'VISIT'}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="panel shortcut-panel">
              <div className="shortcut-top">
                <div>
                  <p className="eyebrow">QUICK ACTION</p>
                  <h2>Got a new request?</h2>
                  <p>Add a booking in a few seconds and keep your team in sync.</p>
                </div>
                <span className="shortcut-illustration">✳</span>
              </div>
              <button className="button button-light" onClick={openBookingDialog}>
                ＋ Create a booking
              </button>
            </section>
          </div>
          <footer className="app-footer">
            <span>© 2026 Booktend</span>
            <span>
              Made for teams that keep things moving <b>↗</b>
            </span>
          </footer>
        </section>

        <section className={`view${view === 'jobs' ? ' active-view' : ''}`}>
          <div className="page-heading compact-heading">
            <div>
              <p className="eyebrow">WORKSPACE</p>
              <h1>All jobs</h1>
              <p className="heading-sub">Manage every service request in one place.</p>
            </div>
            <div className="heading-actions">
              <button
                type="button"
                className="button button-light export-button"
                onClick={handleExportCsv}
                disabled={jobsLoading || allFiltered.length === 0}
                title={allFiltered.length === 0 ? 'No jobs to export' : `Export ${allFiltered.length} jobs as CSV`}
              >
                <span>⤓</span> Export CSV
              </button>
              <button className="button button-dark" onClick={openBookingDialog}>
                <span>＋</span> New booking
              </button>
            </div>
          </div>
          <div className="panel all-jobs-panel">
            <div className="table-toolbar">
              <div className="toolbar-filters">
                <label className="search-box">
                  <span>⌕</span>
                  <input
                    type="search"
                    placeholder="Search jobs, customers, notes…"
                    value={allJobSearch}
                    onChange={(event) => setAllJobSearch(event.target.value)}
                  />
                </label>
                <label className="filter-select">
                  <span className="sr-only">Filter by status</span>
                  <select value={allStatusFilter} onChange={(event) => setAllStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-select">
                  <span className="sr-only">Filter by service</span>
                  <select value={allServiceFilter} onChange={(event) => setAllServiceFilter(event.target.value)}>
                    <option value="all">All services</option>
                    {availableServices.map((svc) => (
                      <option key={svc} value={svc}>
                        {svc}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-select">
                  <span className="sr-only">Filter by date</span>
                  <select value={allDateFilter} onChange={(event) => setAllDateFilter(event.target.value as DatePreset)}>
                    <option value="all">All dates</option>
                    <option value="today">Today</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="past">Past</option>
                    <option value="recent-30">Last 30 days</option>
                  </select>
                </label>
                {hasActiveFilters && (
                  <button className="filter-reset" type="button" onClick={clearAllFilters} aria-label="Clear all applied filters">
                    Clear filters ×
                  </button>
                )}
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => toggleSort('id')}
                        aria-sort={sortColumn === 'id' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        JOB
                        <span className={`sort-indicator${sortColumn === 'id' ? ' active' : ''}`} aria-hidden="true">
                          {sortColumn === 'id' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => toggleSort('customer')}
                        aria-sort={sortColumn === 'customer' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        CUSTOMER
                        <span className={`sort-indicator${sortColumn === 'customer' ? ' active' : ''}`} aria-hidden="true">
                          {sortColumn === 'customer' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => toggleSort('service')}
                        aria-sort={sortColumn === 'service' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        SERVICE
                        <span className={`sort-indicator${sortColumn === 'service' ? ' active' : ''}`} aria-hidden="true">
                          {sortColumn === 'service' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => toggleSort('date')}
                        aria-sort={sortColumn === 'date' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        DATE
                        <span className={`sort-indicator${sortColumn === 'date' ? ' active' : ''}`} aria-hidden="true">
                          {sortColumn === 'date' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => toggleSort('status')}
                        aria-sort={sortColumn === 'status' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        STATUS
                        <span className={`sort-indicator${sortColumn === 'status' ? ' active' : ''}`} aria-hidden="true">
                          {sortColumn === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>{jobsLoading ? skeletonJobRows(6) : renderRows(allFiltered, true)}</tbody>
              </table>
            </div>
            {!jobsLoading && allFiltered.length === 0 && (
              <div className="empty-state">
                <span>▤</span>
                <strong>{hasActiveFilters ? 'No matching jobs found' : 'No jobs found'}</strong>
                <p>
                  {hasActiveFilters ? (
                    <>
                      Try adjusting your search or <button type="button" className="inline-action" onClick={clearAllFilters}>clear all filters</button>.
                    </>
                  ) : (
                    'Try another search or add a new booking.'
                  )}
                </p>
              </div>
            )}
            <div className="panel-footer">
              <span>
                {jobsLoading ? (
                  <span className="skeleton" style={{ height: 11, width: 92 }} />
                ) : hasActiveFilters ? (
                  `Showing ${allFiltered.length} of ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} (filtered)`
                ) : (
                  `Showing ${allFiltered.length} ${allFiltered.length === 1 ? 'job' : 'jobs'}`
                )}
              </span>
              {nextCursor && (
                <button className="button button-light load-more" type="button" onClick={() => void handleLoadMore()} disabled={loadingMore}>
                  Load more jobs ↓
                </button>
              )}
            </div>
          </div>
        </section>

        <section className={`view${view === 'customers' ? ' active-view' : ''}`}>
          <div className="page-heading compact-heading">
            <div>
              <p className="eyebrow">WORKSPACE</p>
              <h1>Customers</h1>
              <p className="heading-sub">A list of customers with active or previous bookings.</p>
            </div>
            <button className="button button-dark" onClick={openBookingDialog}>
              <span>＋</span> New booking
            </button>
          </div>
          <div className="panel all-jobs-panel">
            <div className="table-toolbar">
              <label className="search-box">
                <span>⌕</span>
                <input type="search" placeholder="Search customers…" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
              </label>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>CUSTOMER</th>
                    <th>EMAIL</th>
                    <th>PHONE</th>
                    <th>TOTAL JOBS</th>
                    <th>LAST SERVICE</th>
                  </tr>
                </thead>
                <tbody>
                  {customersLoading && skeletonCustomerRows(5)}
                  {!customersLoading &&
                    customersFiltered.map((customer) => (
                    <tr key={customer.email}>
                      <td>
                        <button
                          className="customer-cell customer-cell-button"
                          type="button"
                          onClick={() => void openCustomer(customer.email)}
                          aria-label={`View customer details for ${customer.customer}`}
                        >
                          <span className="customer-avatar">{initials(customer.customer)}</span>
                          <span className="customer-copy">
                            <strong>{customer.customer}</strong>
                          </span>
                        </button>
                      </td>
                      <td>{customer.email}</td>
                      <td>{customer.phone}</td>
                      <td>{customer.count}</td>
                      <td>{customer.lastService}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!customersLoading && customersFiltered.length === 0 && (
              <div className="empty-state">
                <span>♙</span>
                <strong>No customers yet</strong>
                <p>Create a booking and customers will appear here.</p>
              </div>
            )}
          </div>
        </section>

        <section className={`view${view === 'services' ? ' active-view' : ''}`}>
          <div className="page-heading compact-heading">
            <div>
              <p className="eyebrow">BUSINESS SETTINGS</p>
              <h1>Your services</h1>
              <p className="heading-sub">Choose what customers can request on your booking page.</p>
            </div>
          </div>
          <form className="panel services-panel" onSubmit={handleServicesSubmit}>
            <div className="services-form-heading">
              <span className="metric-icon icon-green">✳</span>
              <div>
                <h2>Services offered</h2>
                <p>Edit the list shown to customers. Keep one service on each line.</p>
              </div>
            </div>
            <label className="sr-only" htmlFor="servicesInput">
              Services, one per line
            </label>
            <textarea
              id="servicesInput"
              name="services"
              rows={9}
              maxLength={2600}
              spellCheck
              placeholder={'Home cleaning\nAppliance repair\nPlumbing'}
              value={servicesInput}
              onChange={(event) => setServicesInput(event.target.value)}
            />
            <label className="directory-toggle">
              <input
                type="checkbox"
                checked={publicListed}
                onChange={(event) => void handleTogglePublicListed(event.target.checked)}
              />
              <span className="directory-toggle-track" aria-hidden="true">
                <span className="directory-toggle-thumb" />
              </span>
              <span className="directory-toggle-copy">
                <strong>List this workspace in the public service directory</strong>
                <small>
                  Let new visitors find {workspace.name} by searching for your services at <code>/book</code>.
                </small>
              </span>
            </label>
            <div className="services-form-footer">
              {servicesError && (
                <p className="form-error" role="alert">
                  {servicesError}
                </p>
              )}
              <span>1–30 services · 2–80 characters each</span>
              <button className="button button-dark" type="submit" disabled={servicesBusy}>
                Save services <span>→</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      <dialog className="booking-dialog" ref={dialogRef} aria-labelledby="dialogTitle">
        <form ref={bookingFormRef} onSubmit={handleBookingSubmit}>
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">NEW REQUEST</p>
              <h2 id="dialogTitle">Create a booking</h2>
              <p>Add a customer and the service they need.</p>
            </div>
            <button className="dialog-close" type="button" aria-label="Close" onClick={() => dialogRef.current?.close()}>
              ×
            </button>
          </div>
          <div className="form-grid">
            <label className="form-field full-field">
              Customer name
              <input name="customer" required placeholder="e.g. Amara Okafor" />
            </label>
            <label className="form-field">
              Email address
              <input name="email" type="email" required placeholder="amara@example.com" />
            </label>
            <label className="form-field">
              Phone number
              <input name="phone" type="tel" required placeholder="+234 800 000 0000" />
            </label>
            <label className="form-field">
              Service
              <select name="service" required defaultValue="">
                <option value="">Choose a service</option>
                {services.map((service) => (
                  <option key={service}>{service}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Preferred date
              <input name="date" type="date" required min={bookingMinDate} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
            </label>
            <label className="form-field full-field">
              Job notes
              <textarea name="notes" rows={3} placeholder="Add details that will help your team…" />
            </label>
          </div>
          <div className="dialog-actions">
            <button className="button button-light" type="button" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button className="button button-dark" type="submit" disabled={bookingBusy}>
              Create booking <span>→</span>
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="booking-dialog customer-dialog" ref={customerDialogRef} aria-labelledby="customerDialogTitle">
        <div className="customer-dialog-body">
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">CUSTOMER</p>
              <h2 id="customerDialogTitle">{customerDetail ? customerDetail.customer.customer : 'Customer details'}</h2>
              <p>
                {customerDetail
                  ? `${customerDetail.customer.count} ${customerDetail.customer.count === 1 ? 'booking' : 'bookings'} · last service ${customerDetail.customer.lastService}`
                  : 'Contact details and booking history.'}
              </p>
            </div>
            <button className="dialog-close" type="button" aria-label="Close" onClick={() => customerDialogRef.current?.close()}>
              ×
            </button>
          </div>

          {customerDetailLoading && (
            <div className="customer-detail-loading" aria-hidden="true">
              <span className="skeleton" style={{ height: 34, width: 200 }} />
              <span className="skeleton" style={{ height: 56, width: '100%' }} />
              <span className="skeleton" style={{ height: 120, width: '100%' }} />
            </div>
          )}

          {customerDetailError && (
            <p className="form-error" role="alert">
              {customerDetailError}
            </p>
          )}

          {customerDetail && (
            <>
              <div className="customer-detail-head">
                <span className="customer-avatar customer-avatar-large">{initials(customerDetail.customer.customer)}</span>
                <div className="customer-detail-contact">
                  <div className="contact-row">
                    <span className="contact-label">Email</span>
                    <a href={`mailto:${customerDetail.customer.email}`}>{customerDetail.customer.email}</a>
                  </div>
                  <div className="contact-row">
                    <span className="contact-label">Phone</span>
                    <span className="contact-value">{customerDetail.customer.phone}</span>
                    <div className="contact-actions">
                      <button className="contact-action" type="button" onClick={() => void handleCopyPhone(customerDetail.customer.phone)}>
                        {contactCopied ? 'Copied' : 'Copy'}
                      </button>
                      <a className="contact-action" href={phoneHref(customerDetail.customer.phone)}>
                        Call
                      </a>
                      {whatsappHref(customerDetail.customer.phone) && (
                        <a
                          className="contact-action"
                          href={whatsappHref(customerDetail.customer.phone) ?? undefined}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="customer-detail-stats">
                <div>
                  <small>TOTAL JOBS</small>
                  <strong>{customerDetail.customer.count}</strong>
                </div>
                <div>
                  <small>LAST SERVICE</small>
                  <strong>{customerDetail.customer.lastService}</strong>
                </div>
                <div>
                  <small>CUSTOMER SINCE</small>
                  <strong>{formatDate(String(customerDetail.customer.firstBookingAt).slice(0, 10))}</strong>
                </div>
              </div>

              <h3 className="customer-detail-heading">Booking history</h3>
              <div className="customer-detail-jobs">
                {customerDetail.jobs.map((job) => (
                  <div className="customer-job" key={job._id}>
                    <span className="job-id">{job._id}</span>
                    <span className="customer-job-service">
                      <strong>{job.service}</strong>
                      {job.notes && <small title={job.notes}>{job.notes}</small>}
                    </span>
                    <span className="date-cell">{formatDate(job.date)}</span>
                    <span className={`status-pill ${statusClass(job.status)}`}>{job.status}</span>
                  </div>
                ))}
              </div>
              {customerDetail.customer.count > customerDetail.jobs.length && (
                <p className="customer-detail-note">
                  Showing the {customerDetail.jobs.length} most recent of {customerDetail.customer.count} bookings.
                </p>
              )}
            </>
          )}

          <div className="dialog-actions">
            <button className="button button-light" type="button" onClick={() => customerDialogRef.current?.close()}>
              Close
            </button>
          </div>
        </div>
      </dialog>

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}
