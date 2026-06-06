import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Logo } from '../components/Logo';

export function ChangePassword() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const forced = user?.mustChangePassword ?? false;

  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast.error('New password and confirmation do not match');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      await refresh();
      toast.success('Password updated');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not change password'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-white p-2 shadow">
            <Logo className="h-full w-full object-contain" />
          </div>
          <h1 className="text-xl font-bold text-navy">Change Password</h1>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-md sm:p-8">
          {forced && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              For security, please set a new password before continuing.
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              id="currentPassword"
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              id="newPassword"
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
              autoComplete="new-password"
              required
            />
            <p className="-mt-1 text-xs text-slate-500">
              At least 8 characters, including a letter and a number.
            </p>
            <Input
              id="confirmPassword"
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" loading={submitting}>
                Update password
              </Button>
              {!forced && (
                <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {forced && (
            <button
              onClick={logout}
              className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-700"
            >
              Sign out instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
