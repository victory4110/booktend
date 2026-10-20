'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import '@/styles/dashboard.css';
import '@/styles/profile.css';
import { api, ApiError } from '@/services/api';
import { initials } from '@/lib/format';
import { useSession } from '@/components/SessionContext';

function resizeImageToDataUrl(file: File, maxDim = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image preview.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(format, 0.88));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const router = useRouter();
  const { user, workspace, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [copied, setCopied] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Avatar upload state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete account state
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied('');
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(''), 2000);
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
    } catch (error) {
      setSigningOut(false);
      // 401 means the session was already gone, which is the outcome we wanted.
      if (error instanceof ApiError && error.status === 401) return;
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out. Try again.');
    }
  }, [signOut]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file (PNG, JPEG, WebP, or GIF).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image is too large. Please select a file under 5MB.');
      return;
    }

    setAvatarError('');
    setUploadingAvatar(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 320);
      const res = await api<{ ok: boolean; avatarUrl: string | null }>('/api/auth/avatar', {
        method: 'POST',
        body: JSON.stringify({ avatar: dataUrl })
      });
      setAvatarUrl(res.avatarUrl);
      user.avatarUrl = res.avatarUrl;
      router.refresh();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not upload photo. Try again.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError('');
    setUploadingAvatar(true);
    try {
      await api<{ ok: boolean; avatarUrl: null }>('/api/auth/avatar', {
        method: 'POST',
        body: JSON.stringify({ avatar: null })
      });
      setAvatarUrl(null);
      user.avatarUrl = null;
      router.refresh();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not remove photo. Try again.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAccount = useCallback(async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api<void>('/api/auth/account', { method: 'DELETE' });
      deleteDialogRef.current?.close();
      router.replace('/');
      router.refresh();
    } catch (error) {
      setDeleting(false);
      setDeleteError(error instanceof Error ? error.message : 'Could not delete account. Try again.');
    }
  }, [router]);

  const bookingUrl = `/book/${encodeURIComponent(workspace.slug)}`;
  const isOwner = user.role === 'owner';
  const absoluteBookingUrl = new URL(bookingUrl, typeof window === 'undefined' ? 'http://localhost' : window.location.origin).href;
  const copyButton = (label: string, value: string, text = 'Copy') => (
    <button
      className={`copy-button${copied === label ? ' copied' : ''}`}
      type="button"
      onClick={() => void copy(label, value)}
      aria-label={`Copy ${label}`}
    >
      {copied === label ? 'Copied ✓' : text}
    </button>
  );

  return (
    <div className="content-wrap profile-wrap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h1>Your profile</h1>
          <p className="heading-sub">The account signed in and the workspace it belongs to.</p>
        </div>
      </div>

      <section className="panel profile-hero">
        <div className="profile-avatar-block">
          <span className="avatar avatar-xl">
            {avatarUrl ? (
              <img src={avatarUrl} alt={user.name} className="avatar-img" />
            ) : (
              initials(user.name) || 'BT'
            )}
          </span>
          <div className="avatar-actions">
            <input
              type="file"
              ref={fileInputRef}
              className="avatar-input"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => void handleFileSelect(e)}
              aria-label="Upload profile photo"
            />
            <button
              className="button button-light avatar-upload-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? 'Uploading...' : avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {avatarUrl && (
              <button
                className="avatar-remove-button"
                type="button"
                onClick={() => void handleRemoveAvatar()}
                disabled={uploadingAvatar}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <div className="profile-hero-text">
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <div className="profile-chips">
            <span className={`role-badge${isOwner ? '' : ' role-badge-staff'}`}>{isOwner ? 'Workspace owner' : 'Staff member'}</span>
            <span className="slug-chip">{workspace.name}</span>
          </div>
          {avatarError && <p className="avatar-error">{avatarError}</p>}
        </div>
      </section>

      <div className="profile-columns">
        <div className="profile-stack">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Account details</h2>
                <p>How you appear across this workspace.</p>
              </div>
            </div>
            <dl className="detail-list">
              <div className="detail-row">
                <dt>
                  Full name
                  <span className="detail-hint">Shown on the bookings you create.</span>
                </dt>
                <dd className="detail-value">{user.name}</dd>
              </div>
              <div className="detail-row">
                <dt>
                  Email
                  <span className="detail-hint">Used to sign in and to reach you about jobs.</span>
                </dt>
                <dd className="detail-value">
                  <span>{user.email}</span>
                  {copyButton('email', user.email)}
                </dd>
              </div>
              <div className="detail-row">
                <dt>
                  Role
                  <span className="detail-hint">
                    {isOwner ? 'Full access, including services and settings.' : 'Can work jobs and customers.'}
                  </span>
                </dt>
                <dd className="detail-value">{isOwner ? 'Workspace owner' : 'Staff member'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Signing out</h2>
                <p>Ends this browser session straight away.</p>
              </div>
            </div>
            <p className="profile-note">
              Booktend staff will never ask you for your password. If you are on a shared computer, sign out when you
              are done.
            </p>
            {signOutError && (
              <p className="profile-error" role="alert">
                {signOutError}
              </p>
            )}
            <div className="profile-actions">
              <button className="button button-danger" type="button" onClick={() => void handleSignOut()} disabled={signingOut}>
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </section>

          <section className="panel danger-panel">
            <div className="panel-heading">
              <div>
                <h2>Delete account</h2>
                <p>{isOwner ? 'Permanently delete this workspace and all data.' : 'Permanently remove your staff account.'}</p>
              </div>
            </div>
            <p className="profile-note">
              {isOwner
                ? 'Deleting your account will permanently erase your workspace, bookings, services, and all associated accounts. This action cannot be undone.'
                : 'Deleting your account will permanently revoke your access to this workspace. This action cannot be undone.'}
            </p>
            <div className="profile-actions">
              <button
                className="button button-danger"
                type="button"
                onClick={() => {
                  setDeleteError('');
                  deleteDialogRef.current?.showModal();
                }}
              >
                Delete account
              </button>
            </div>
          </section>
        </div>

        <div className="profile-stack">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Public booking page</h2>
                <p>Share this link with customers.</p>
              </div>
            </div>
            <p className="booking-url">{bookingUrl}</p>
            <div className="profile-actions">
              <a className="button button-dark" href={bookingUrl} target="_blank" rel="noopener">
                Open page ↗
              </a>
              {copyButton('booking link', absoluteBookingUrl, 'Copy link')}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Workspace</h2>
                <p>The business this account belongs to.</p>
              </div>
            </div>
            <dl className="detail-list">
              <div className="detail-row">
                <dt>Business name</dt>
                <dd className="detail-value">{workspace.name}</dd>
              </div>
              <div className="detail-row">
                <dt>
                  Workspace slug
                  <span className="detail-hint">Used in the page address.</span>
                </dt>
                <dd className="detail-value">
                  <span className="slug-chip">{workspace.slug}</span>
                  {copyButton('slug', workspace.slug)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <dialog className="booking-dialog" ref={deleteDialogRef} aria-labelledby="deleteDialogTitle">
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); void handleDeleteAccount(); }}>
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">DANGER ZONE</p>
              <h2 id="deleteDialogTitle">Delete account</h2>
              <p>This action is irreversible.</p>
            </div>
            <button className="dialog-close" type="button" aria-label="Close" onClick={() => deleteDialogRef.current?.close()} disabled={deleting}>
              ×
            </button>
          </div>
          <p className="confirm-delete-text">
            Are you sure you want to delete your account?
            {isOwner ? (
              <strong> All bookings, customers, services, and workspace settings for &ldquo;{workspace.name}&rdquo; will be permanently erased.</strong>
            ) : (
              <strong> You will lose access to the &ldquo;{workspace.name}&rdquo; workspace immediately.</strong>
            )}
          </p>
          {deleteError && (
            <p className="profile-error" role="alert">
              {deleteError}
            </p>
          )}
          <div className="dialog-actions">
            <button className="button button-light" type="button" onClick={() => deleteDialogRef.current?.close()} disabled={deleting}>
              Cancel
            </button>
            <button className="button button-danger" type="submit" disabled={deleting}>
              {deleting ? 'Deleting account...' : 'Yes, delete my account'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
