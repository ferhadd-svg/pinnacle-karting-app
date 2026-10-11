import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export function AuthForm({ allowRegister = true }: { allowRegister?: boolean }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ email, password, displayName });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form card" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Sign in' : 'Create your driver account'}</h2>
      {mode === 'register' && (
        <label>
          Driver name (shown on results)
          <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
        </label>
      )}
      <label>
        Email
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        Password
        <input
          required
          type="password"
          minLength={mode === 'register' ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      {allowRegister && (
        <button type="button" className="link-btn" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      )}
    </form>
  );
}
