import { useState, FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : '/dashboard'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const u = await login(username.trim(), password);
      toast.success(`Welcome, ${u.fullName.split(' ')[0]}`);
      navigate(u.mustChangePassword ? '/change-password' : '/dashboard', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-dark via-navy to-navy-light p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-xl bg-white p-2 shadow-lg">
            <Logo className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">RLR Sales and Services</h1>
          <p className="text-sm text-silver-light">Business Management System</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-navy">Sign in</h2>
          <p className="mb-5 text-sm text-slate-500">Enter your credentials to continue.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              id="username"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
            <Input
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Button type="submit" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-silver-light">
          © {new Date().getFullYear()} RLR Sales and Services Corporation
        </p>
      </div>
    </div>
  );
}
