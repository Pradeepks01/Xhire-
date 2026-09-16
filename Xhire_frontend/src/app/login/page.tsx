'use client';

import { useState, Suspense } from 'react';
import { apiClient } from '../../api';
import type { AxiosError } from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Mail, Lock, AlertCircle, Briefcase } from 'lucide-react';
import '../../styles/LoginPage.css';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/recruiter';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);

    try {
      const response = await apiClient.post(
        '/login',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, user } = response.data;
      login(access_token, user);
      router.replace(from);
    } catch (err) {
      const axiosError = err as AxiosError;
      if (axiosError.response?.status === 401) {
        setError('Incorrect email or password.');
      } else {
        setError('Login failed. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <Briefcase size={36} style={{ color: '#F59E0B', filter: 'drop-shadow(0 2px 8px rgba(245, 158, 11, 0.4))' }} />
        </div>
        <h2>XHire Login</h2>
        <p className="login-subtitle">Welcome back, please sign in to continue</p>

        <div className="form-group">
          <label htmlFor="email" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Mail size={14} />
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="recruiter@airbus.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={14} />
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Enter your password"
          />
        </div>

        {error && (
          <p className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={15} style={{ minWidth: '15px' }} />
            {error}
          </p>
        )}

        <button type="submit" className="login-btn" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <LogIn size={16} />
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="loader">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}