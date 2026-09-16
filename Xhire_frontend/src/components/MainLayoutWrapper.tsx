'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';

export function MainLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCandidateLogin = pathname === '/candidate-login';
  const isCandidatePortal = pathname.startsWith('/candidate/');
  const isFullScreen = isCandidateLogin || isCandidatePortal;

  return (
    <div id="root">
      <Navbar />
      <main className={`main-content ${isFullScreen ? 'full-screen' : ''}`}>
        {children}
      </main>
    </div>
  );
}
