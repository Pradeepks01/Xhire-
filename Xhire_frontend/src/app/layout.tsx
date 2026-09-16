import type { Metadata } from 'next';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ThemeProvider } from '../context/ThemeContext';
import { MainLayoutWrapper } from '../components/MainLayoutWrapper';
import './globals.css';

export const metadata: Metadata = {
  title: 'XHire - Autonomous Multi-Agent Technical Screening',
  description: 'AI-driven technical interviewing and assessment platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <MainLayoutWrapper>{children}</MainLayoutWrapper>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
