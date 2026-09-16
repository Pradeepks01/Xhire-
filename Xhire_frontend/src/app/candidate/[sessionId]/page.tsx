'use client';

import dynamic from 'next/dynamic';

const CandidatePortalClient = dynamic(
  () => import('../../../components/CandidatePortalClient'),
  {
    ssr: false,
    loading: () => (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d16', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '18px', fontWeight: 600 }}>Loading Candidate Portal...</p>
        </div>
      </div>
    ),
  }
);

export default function CandidatePortalPage() {
  return <CandidatePortalClient />;
}