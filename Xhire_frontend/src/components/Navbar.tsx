'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { Briefcase, LayoutDashboard, LogOut, LogIn } from 'lucide-react';

function PinkRobotAvatar({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      {/* Outer rounded container */}
      <rect width="36" height="36" rx="18" fill="#1e1e2f" />
      {/* Robot Antenna / Ears */}
      <rect x="5" y="13" width="4" height="9" rx="1" fill="#f43f5e" />
      <rect x="27" y="13" width="4" height="9" rx="1" fill="#f43f5e" />
      <rect x="16" y="5" width="4" height="4" rx="1" fill="#f43f5e" />
      {/* Robot Head */}
      <rect x="7" y="9" width="22" height="19" rx="4" fill="#fb7185" />
      {/* Eye band */}
      <rect x="10" y="14" width="16" height="6" rx="2" fill="#0f172a" />
      {/* Eyes */}
      <circle cx="14" cy="17" r="2" fill="#38bdf8" />
      <circle cx="22" cy="17" r="2" fill="#38bdf8" />
      {/* Mouth */}
      <rect x="13" y="22.5" width="10" height="2.5" rx="1" fill="#0f172a" />
      <rect x="14.5" y="23" width="7" height="1.5" rx="0.5" fill="#34d399" />
    </svg>
  );
}

export function Navbar() {
  const { isAuthenticated, logout, user } = useAuth();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isCandidateLogin = pathname === '/candidate-login';
  const isTransparentNav = isCandidateLogin;

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  return (
    <nav className={`main-nav ${isTransparentNav ? 'transparent-nav' : ''}`}>
      <div className="nav-content">
        <Link
          href={isAuthenticated ? '/recruiter' : '/login'}
          className="nav-brand-link"
        >
          <Briefcase size={22} style={{ color: '#F59E0B', filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.45))' }} />
          <h3>XHire</h3>
        </Link>

        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {isAuthenticated && (
            <Link
              href="/recruiter"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--text-light, #ffffff)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 600,
                opacity: 0.9
              }}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
          )}

          <ThemeToggle />

          {isAuthenticated ? (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  background: 'transparent',
                  border: dropdownOpen ? '2px solid #f43f5e' : '2px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: '50%',
                  padding: '2px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  boxShadow: dropdownOpen ? '0 0 12px rgba(244, 63, 94, 0.5)' : 'none'
                }}
                title={user?.full_name || 'pradeepks'}
              >
                <PinkRobotAvatar size={32} />
              </button>

              {/* Floating Dropdown Card */}
              {dropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    width: '240px',
                    background: '#0d131f',
                    border: '1px solid #1e293b',
                    borderRadius: '16px',
                    padding: '16px 18px',
                    boxShadow: '0 20px 35px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                    zIndex: 1000,
                    animation: 'fadeIn 0.15s ease-out'
                  }}
                >
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      color: '#f8fafc',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2
                    }}>
                      {user?.full_name || 'pradeepks'}
                    </div>
                    <div style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      marginTop: '4px',
                      wordBreak: 'break-all',
                      lineHeight: 1.3
                    }}>
                      {user?.email || 'pradeepks7483@gmail.com'}
                    </div>
                  </div>

                  <div style={{
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    marginBottom: '10px'
                  }} />

                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      logout();
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogOut size={16} color="#ef4444" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--brand-primary)', padding: '0.5rem 1.2rem' }}
            >
              <LogIn size={16} />
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
