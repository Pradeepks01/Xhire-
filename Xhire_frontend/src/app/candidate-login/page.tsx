'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '../../api';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { Mail, KeyRound, AlertCircle, ArrowRight, Briefcase } from 'lucide-react';
import '../../styles/LoginPage.css';

export default function CandidateLoginPage() {
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const qEmail = searchParams.get('email');
      const qCode = searchParams.get('code');

      if (qEmail) setEmail(qEmail);
      if (qCode) setAccessCode(qCode.toUpperCase());

      // If both are provided in the email link, auto-authenticate seamlessly
      if (qEmail && qCode) {
        performLogin(qEmail, qCode.toUpperCase());
      }
    }
  }, []);

  const performLogin = async (candidateEmail: string, candidateCode: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post(
        '/candidate-login',
        {
          email: candidateEmail,
          access_code: candidateCode
        }
      );

      const { session_uuid } = response.data;
      router.push(`/candidate/${session_uuid}`);
    } catch (err) {
      const axiosError = err as AxiosError;
      if (axiosError.response?.status === 401) {
        setError('Invalid email or access code.');
      } else {
        setError('Login failed. Please verify your credentials and try again.');
      }
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(email, accessCode);
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <Briefcase size={36} style={{ color: '#F59E0B', filter: 'drop-shadow(0 2px 8px rgba(245, 158, 11, 0.4))' }} />
        </div>
        <h2>Candidate Portal</h2>
        <p className="candidate-intro">
          Please enter your email and the access code provided by your recruiter to begin your interview session.
        </p>

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
            placeholder="candidate@example.com"
          />
        </div>

        <div className="form-group">
          <label htmlFor="code" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <KeyRound size={14} />
            Access Code
          </label>
          <input
            id="code"
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
            placeholder="e.g., AB12-CD34"
            required
          />
        </div>

        {error && (
          <p className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={15} style={{ minWidth: '15px' }} />
            {error}
          </p>
        )}

        <button type="submit" className="login-btn" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <ArrowRight size={16} />
          {loading ? 'Verifying...' : 'Start Interview'}
        </button>
      </form>
    </div>
  );
}