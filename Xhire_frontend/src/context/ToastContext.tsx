'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success', durationMs = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 20px',
              borderRadius: '8px',
              backgroundColor: toast.type === 'success' ? '#032519' : toast.type === 'error' ? '#2d0c14' : toast.type === 'warning' ? '#2e1c05' : '#0f172a',
              border: toast.type === 'success' ? '1px solid #059669' : toast.type === 'error' ? '1px solid #dc2626' : toast.type === 'warning' ? '1px solid #d97706' : '1px solid #3b82f6',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 16px rgba(16, 185, 129, 0.12)',
              color: toast.type === 'success' ? '#4ade80' : toast.type === 'error' ? '#f87171' : toast.type === 'warning' ? '#fbbf24' : '#60a5fa',
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: '14.5px',
              fontWeight: 600,
              letterSpacing: '-0.2px',
              maxWidth: '480px',
              animation: 'toastSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Lucide Icon */}
            {toast.type === 'success' && <CheckCircle2 size={20} style={{ minWidth: '20px', color: '#4ade80' }} />}
            {toast.type === 'error' && <AlertCircle size={20} style={{ minWidth: '20px', color: '#f87171' }} />}
            {toast.type === 'info' && <Info size={20} style={{ minWidth: '20px', color: '#60a5fa' }} />}
            {toast.type === 'warning' && <AlertTriangle size={20} style={{ minWidth: '20px', color: '#fbbf24' }} />}

            <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
            <X size={16} style={{ opacity: 0.6, cursor: 'pointer', marginLeft: '4px' }} />
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateY(-12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}