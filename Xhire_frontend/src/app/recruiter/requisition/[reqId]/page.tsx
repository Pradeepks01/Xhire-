'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '../../../../api';
import { AxiosError } from 'axios';
import type { RequisitionDetails } from '../../../../types';
import { ProtectedRoute } from '../../../../components/ProtectedRoute';
import { useToast } from '../../../../context/ToastContext';
import { 
  ArrowLeft, 
  Pencil, 
  RefreshCw, 
  UserPlus, 
  ExternalLink, 
  Send, 
  Copy, 
  BarChart3, 
  Download, 
  Mail, 
  AlertTriangle, 
  Check, 
  FileText, 
  Upload, 
  CheckCircle2, 
  Users, 
  Award,
  Calendar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  LayoutList,
  X,
  Search
} from 'lucide-react';
import '../../../../styles/RequisitionDetails.css';
import { CandidateMatrixView } from '../../../../components/CandidateMatrixView';
import { AutoTuneModal } from '../../../../components/AutoTuneModal';

const AVATAR_COLORS = [
  'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  'linear-gradient(135deg, #10b981 0%, #047857 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
];

const getInitials = (name: string) => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

function RequisitionDetailsContent() {
  const params = useParams();
  const reqId = params?.reqId as string;
  const { showToast } = useToast();
  const [requisition, setRequisition] = useState<RequisitionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Form & View State ---
  const [activeTab, setActiveTab] = useState<'pipeline' | 'matrix'>('pipeline');
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showAutoTuneModal, setShowAutoTuneModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCV, setInviteCV] = useState("");
  const [cvInputMethod, setCvInputMethod] = useState<"text" | "file">("text");
  const [cvFileName, setCvFileName] = useState("");
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [cvWarning, setCvWarning] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [createdSessionUrl, setCreatedSessionUrl] = useState<string | null>(null);
  const [createdCandidateName, setCreatedCandidateName] = useState<string>("");
  const [downloadingPdfSessionId, setDownloadingPdfSessionId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditingAtsId, setIsEditingAtsId] = useState(false);
  const [atsIdValue, setAtsIdValue] = useState("");
  const [isSavingAtsId, setIsSavingAtsId] = useState(false);

  const handleUpdateAtsId = async () => {
    if (!reqId) return;
    try {
      setIsSavingAtsId(true);
      await apiClient.patch(`/requisitions/${reqId}`, {
        ats_id: atsIdValue.trim() || null,
      });
      showToast(`ATS ID updated to "${atsIdValue.trim() || 'Not Set'}"!`, 'success');
      setIsEditingAtsId(false);
      fetchRequisitionDetails(true);
    } catch (err: any) {
      showToast(`Failed to update ATS ID: ${err.message}`, 'error');
    } finally {
      setIsSavingAtsId(false);
    }
  };

  const handleDownloadPdf = async (sessionId: string, candidateName: string) => {
    try {
      setDownloadingPdfSessionId(sessionId);
      const response = await apiClient.get(`/reports/${sessionId}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.setAttribute('download', `XHire_Report_${sanitizedName}_${sessionId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("PDF report downloaded successfully!", "success");
    } catch (err: any) {
      console.error("PDF download failed:", err);
      showToast("Failed to download PDF report. Please try again.", "error");
    } finally {
      setDownloadingPdfSessionId(null);
    }
  };

  const resetInviteModal = () => {
    setInviteName("");
    setInviteEmail("");
    setInviteCV("");
    setCvFileName("");
    setCvWarning(null);
    setInviteError(null);
    setIsUploadingCv(false);
    setCvInputMethod("text");
  };

  const handleCvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCvFileName(file.name);
      setIsUploadingCv(true);
      setInviteError(null);
      setCvWarning(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await apiClient.post<{
          cv_text: string;
          filename?: string;
          warning?: string;
          is_evaluation_report?: boolean;
        }>("/interviews/upload-cv", formData);

        setInviteCV(response.data.cv_text);
        if (response.data.warning) {
          setCvWarning(response.data.warning);
        } else {
          showToast(`Successfully extracted resume text from "${file.name}"!`, 'success');
        }
      } catch (err: any) {
        const errMsg = err.response?.data?.detail || err.message;
        setInviteError(`Resume Document Validation Failed: ${errMsg}`);
        setInviteCV("");
      } finally {
        setIsUploadingCv(false);
      }
    }
  };

  // --- Data Fetching ---
  const fetchRequisitionDetails = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
      if (!requisition) setLoading(true);
    }
    try {
      const response = await apiClient.get<RequisitionDetails>(
        `/requisitions/${reqId}`
      );
      setRequisition(response.data);
      setError(null);
    } catch (err: any) {
      if (!silent && !requisition) {
        setError(`Failed to fetch requisition details: ${err.message}`);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (reqId) {
      fetchRequisitionDetails();
    }
  }, [reqId]);

  // --- Polling Effect (Real-time update) ---
  useEffect(() => {
    if (!reqId) return;

    // Check if any candidate session is actively ongoing
    const hasActiveSessions = (requisition?.interview_sessions || []).some(
      (s) => ['invited', 'processing', 'started', 'answer_processing'].includes(s.status?.toLowerCase())
    );

    // Poll every 3 seconds if interviews are active/running, or every 8 seconds when idle
    const pollInterval = hasActiveSessions ? 3000 : 8000;
    const timer = setTimeout(() => {
      fetchRequisitionDetails(true);
    }, pollInterval);

    return () => clearTimeout(timer);
  }, [requisition, reqId]);

  // --- Event Handlers ---
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError("Candidate name and email are required.");
      return;
    }

    if (!inviteCV.trim()) {
      setInviteError("Candidate CV content is required. Please paste resume text or select a PDF.");
      return;
    }

    if (cvWarning) {
      const confirmUse = window.confirm(
        "Warning: The uploaded file appears to be an interview evaluation report, not a candidate resume. Are you sure you want to proceed?"
      );
      if (!confirmUse) return;
    }

    setInviteError(null);

    try {
      const res = await apiClient.post<{ session_uuid: string }>('/interviews', {
        requisition_id: Number(reqId),
        candidate_email: inviteEmail.trim(),
        candidate_name: inviteName.trim(),
        cv_text: inviteCV.trim(),
      });

      const sessionUuid = res.data.session_uuid;
      const targetName = inviteName.trim();
      const targetEmail = inviteEmail.trim();

      setShowModal(false);
      setCreatedSessionUrl(`/candidate/${sessionUuid}`);
      setCreatedCandidateName(targetName);

      showToast(`Candidate ${targetName} (${targetEmail}) invited! Direct link generated.`, 'success');
      resetInviteModal();
      fetchRequisitionDetails();

    } catch (err: any) {
      const axiosError = err as AxiosError;
      if (axiosError.response?.data) {
        setInviteError(`Invite failed: ${JSON.stringify(axiosError.response.data)}`);
      } else {
        setInviteError(`Invite failed: ${err.message}`);
      }
    }
  };

  if (loading && !requisition) return <p className="loader">Loading details...</p>;
  if (error) return <p className="error-message">{error}</p>;
  if (!requisition) return <p>Requisition not found.</p>;

  return (
    <div className="details-container">
      <header className="details-header">
        <div>
          <Link href="/recruiter" className="back-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
          <h2>{requisition.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span className={`status-badge status-${requisition.status.toLowerCase()}`}>
              {requisition.status}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', color: 'var(--neutral-600)' }}>
              <strong>ATS ID:</strong>
              {isEditingAtsId ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input
                    type="text"
                    value={atsIdValue}
                    onChange={(e) => setAtsIdValue(e.target.value)}
                    placeholder="e.g. REQ-2024-01"
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.85rem',
                      border: '1px solid var(--brand-primary)',
                      borderRadius: '4px',
                      outline: 'none',
                      width: '140px'
                    }}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateAtsId();
                      if (e.key === 'Escape') setIsEditingAtsId(false);
                    }}
                  />
                  <button
                    onClick={handleUpdateAtsId}
                    disabled={isSavingAtsId}
                    style={{
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.8rem',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 600
                    }}
                  >
                    <Check size={13} />
                    {isSavingAtsId ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingAtsId(false);
                      setAtsIdValue(requisition.ats_id || "");
                    }}
                    style={{
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.8rem',
                      background: 'var(--neutral-200)',
                      color: 'var(--neutral-700)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <X size={13} />
                    Cancel
                  </button>
                </div>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <code style={{ background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px', color: '#1e293b', fontWeight: 600, border: '1px solid #cbd5e1' }}>
                    {requisition.ats_id || "Not Set"}
                  </code>
                  <button
                    onClick={() => {
                      setAtsIdValue(requisition.ats_id || "");
                      setIsEditingAtsId(true);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--brand-primary)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '0 0.2rem'
                    }}
                    title="Edit ATS ID"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowAutoTuneModal(true)}
            className="btn-secondary"
            style={{
              padding: '0.75rem 1.15rem',
              fontSize: '0.95rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(168, 85, 247, 0.18) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              color: '#c4b5fd',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Auto-tune Job Description & Generate Seniority Question Banks"
          >
            <Sparkles size={16} color="#a78bfa" />
            Auto-Tune JD
          </button>
          <button
            onClick={() => fetchRequisitionDetails(false)}
            disabled={isRefreshing}
            className="btn-secondary"
            style={{ padding: '0.75rem 1.25rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title="Refresh candidate pipeline and interview statuses"
          >
            <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => {
              resetInviteModal();
              setShowModal(true);
            }}
            className="create-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <UserPlus size={16} />
            Invite Candidate
          </button>
        </div>
      </header>

      {/* Direct Interview Quick-Launch Banner */}
      {createdSessionUrl && (
        <div style={{
          backgroundColor: '#064e3b',
          border: '1px solid #059669',
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#ecfdf5',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
        }}>
          <div>
            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} style={{ color: '#34d399' }} />
              Candidate Invited: {createdCandidateName}
            </strong>
            <div style={{ fontSize: '13px', color: '#a7f3d0', marginTop: '3px' }}>
              Their unique interview session is initialized with their resume. Ready for testing.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <a
              href={createdSessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{
                background: '#10b981',
                color: '#064e3b',
                fontWeight: 700,
                padding: '8px 16px',
                textDecoration: 'none',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              Open Interview Portal
              <ExternalLink size={14} />
            </a>
            <button
              onClick={() => setCreatedSessionUrl(null)}
              className="btn btn-secondary"
              style={{ padding: '8px 14px' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Stats Section */}
      <div className="stats-grid">
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-value">{(requisition.interview_sessions || []).length}</div>
            <Users size={22} style={{ color: 'var(--brand-primary)', opacity: 0.85 }} />
          </div>
          <div className="stat-label">Total Candidates</div>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-value">
              {(requisition.interview_sessions || []).filter(s => s.status === 'completed').length}
            </div>
            <CheckCircle2 size={22} style={{ color: 'var(--color-success, #44D62C)', opacity: 0.85 }} />
          </div>
          <div className="stat-label">Completed Interviews</div>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-value">
              {((requisition.interview_sessions || [])
                .filter(s => s.dar_data?.resume_assessment?.suitability_index)
                .reduce((acc, s) => acc + (s.dar_data?.resume_assessment?.suitability_index || 0), 0) /
                ((requisition.interview_sessions || []).filter(s => s.dar_data?.resume_assessment?.suitability_index).length || 1)
              ).toFixed(1)}
            </div>
            <Award size={22} style={{ color: '#f59e0b', opacity: 0.85 }} />
          </div>
          <div className="stat-label">Avg Suitability Score</div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '2px solid rgba(51, 65, 85, 0.6)',
        marginBottom: '20px',
        paddingBottom: '2px'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('pipeline')}
          style={{
            padding: '10px 20px',
            fontSize: '0.95rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'pipeline' ? '3px solid var(--brand-primary, #38bdf8)' : '3px solid transparent',
            color: activeTab === 'pipeline' ? 'var(--brand-primary, #38bdf8)' : '#94a3b8',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '-2px'
          }}
        >
          <LayoutList size={18} />
          Candidate Pipeline ({(requisition.interview_sessions || []).length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          style={{
            padding: '10px 20px',
            fontSize: '0.95rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'matrix' ? '3px solid var(--brand-primary, #38bdf8)' : '3px solid transparent',
            color: activeTab === 'matrix' ? 'var(--brand-primary, #38bdf8)' : '#94a3b8',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '-2px'
          }}
        >
          <TrendingUp size={18} />
          Comparative Candidate Matrix & Radar Overlay
        </button>
      </div>

      {activeTab === 'matrix' ? (
        <CandidateMatrixView reqId={reqId} />
      ) : (
        /* --- Candidate List --- */
        <div className="pipeline-container">
          {/* Header Controls: Title, Search, and Status Filter Chips */}
          <div className="pipeline-header-controls">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary, #0f172a)' }}>
                Candidate Pipeline
              </h3>
              <span style={{
                background: 'var(--neutral-100, #f1f5f9)',
                color: 'var(--neutral-600, #475569)',
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid var(--neutral-200, #e2e8f0)'
              }}>
                {(requisition.interview_sessions || []).length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="pipeline-search-box">
                <Search size={16} style={{ color: 'var(--neutral-400, #94a3b8)' }} />
                <input
                  type="text"
                  placeholder="Search candidate, email, code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="pipeline-filter-chips">
                {[
                  { id: 'ALL', label: 'All', count: (requisition.interview_sessions || []).length },
                  { id: 'COMPLETED', label: 'Completed', count: (requisition.interview_sessions || []).filter(s => s.status.toLowerCase() === 'completed').length },
                  { id: 'PROCESSING', label: 'In Progress', count: (requisition.interview_sessions || []).filter(s => ['started', 'processing', 'answer_processing'].includes(s.status.toLowerCase())).length },
                  { id: 'INVITED', label: 'Invited', count: (requisition.interview_sessions || []).filter(s => s.status.toLowerCase() === 'invited').length },
                  { id: 'FAILED', label: 'Failed', count: (requisition.interview_sessions || []).filter(s => s.status.toLowerCase() === 'failed').length },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`filter-chip ${statusFilter === tab.id ? 'active' : ''}`}
                    onClick={() => setStatusFilter(tab.id)}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table Container */}
          {(requisition.interview_sessions || []).length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-500)' }}>
              <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
              <p style={{ margin: 0, fontSize: '0.95rem' }}>No candidates have been invited to this requisition yet.</p>
            </div>
          ) : (
            <div className="pipeline-table-wrapper">
              <table className="pipeline-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Status</th>
                    <th>Schedule</th>
                    <th>AI Authenticity</th>
                    <th>Score</th>
                    <th>Access Code</th>
                    <th style={{ textAlign: 'right', paddingRight: '18px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(requisition.interview_sessions || [])
                    .filter(session => {
                      const q = searchTerm.toLowerCase();
                      const matchSearch =
                        !searchTerm ||
                        session.candidate.full_name.toLowerCase().includes(q) ||
                        session.candidate.email.toLowerCase().includes(q) ||
                        session.access_code.toLowerCase().includes(q);
                      if (!matchSearch) return false;

                      const st = session.status.toLowerCase();
                      if (statusFilter === 'COMPLETED') return st === 'completed';
                      if (statusFilter === 'PROCESSING') return ['started', 'processing', 'answer_processing'].includes(st);
                      if (statusFilter === 'INVITED') return st === 'invited';
                      if (statusFilter === 'FAILED') return st === 'failed';
                      return true;
                    })
                    .map(session => (
                      <tr key={session.session_uuid}>
                        {/* 1. Candidate Profile Cell */}
                        <td>
                          <div className="candidate-profile-cell">
                            <div
                              className="candidate-avatar"
                              style={{ background: getAvatarColor(session.candidate.full_name) }}
                            >
                              {getInitials(session.candidate.full_name)}
                            </div>
                            <div className="candidate-info">
                              <span className="candidate-name">{session.candidate.full_name}</span>
                              <span className="candidate-email">{session.candidate.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Status Cell */}
                        <td>
                          <span className={`status-pill status-${session.status.toLowerCase()}`}>
                            <span className="status-dot" />
                            {session.status === 'answer_processing' ? 'Evaluating' :
                             session.status === 'processing' ? 'Analyzing' :
                             session.status === 'started' ? 'In Progress' :
                             session.status}
                          </span>
                        </td>

                        {/* 3. Schedule Cell */}
                        <td>
                          {session.scheduled_at ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '0.8rem',
                              color: 'var(--text-body, #334155)',
                              background: 'var(--neutral-100, #f1f5f9)',
                              border: '1px solid var(--neutral-200, #e2e8f0)',
                              padding: '3px 8px',
                              borderRadius: '6px'
                            }}>
                              <Calendar size={12} color="var(--brand-primary, #0284c7)" />
                              {new Date(session.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                              {new Date(session.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.78rem',
                              color: 'var(--neutral-400, #94a3b8)',
                              background: 'var(--neutral-100, #f8fafc)',
                              border: '1px solid var(--neutral-200, #e2e8f0)',
                              padding: '2px 8px',
                              borderRadius: '4px'
                            }}>
                              Unscheduled
                            </span>
                          )}
                        </td>

                        {/* 4. AI Authenticity Cell */}
                        <td>
                          {session.is_ai_flagged ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)'
                            }}>
                              <AlertTriangle size={12} />
                              AI Flagged
                            </span>
                          ) : (session.status === 'completed' || session.status === 'started') ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                              <ShieldCheck size={12} />
                              Human {typeof session.ai_integrity_score === 'number' ? `${session.ai_integrity_score.toFixed(0)}%` : '100%'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--neutral-400, #94a3b8)', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>

                        {/* 5. Score Cell */}
                        <td>
                          {typeof session.dar_data?.synthesis?.final_score === 'number' ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                  fontWeight: 700,
                                  fontSize: '0.92rem',
                                  color: session.dar_data.synthesis.final_score >= 70 ? '#10b981' : session.dar_data.synthesis.final_score >= 50 ? '#f59e0b' : '#ef4444'
                                }}>
                                  {session.dar_data.synthesis.final_score.toFixed(0)}%
                                </span>
                                <div style={{ width: '40px', height: '5px', background: 'var(--neutral-200, #e2e8f0)', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${session.dar_data.synthesis.final_score}%`,
                                    height: '100%',
                                    background: session.dar_data.synthesis.final_score >= 70 ? '#10b981' : session.dar_data.synthesis.final_score >= 50 ? '#f59e0b' : '#ef4444'
                                  }} />
                                </div>
                              </div>
                              {typeof session.dar_data?.resume_assessment?.suitability_index === 'number' && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500, #64748b)', marginTop: '2px' }}>
                                  CV: {session.dar_data.resume_assessment.suitability_index.toFixed(1)} / 5.0
                                </div>
                              )}
                            </div>
                          ) : typeof session.dar_data?.resume_assessment?.suitability_index === 'number' ? (
                            <div>
                              <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-body, #334155)' }}>
                                {session.dar_data.resume_assessment.suitability_index.toFixed(1)} / 5.0
                              </span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400, #94a3b8)' }}>Resume only</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--neutral-400, #94a3b8)', fontSize: '0.8rem' }}>Pending</span>
                          )}
                        </td>

                        {/* 6. Access Code Cell */}
                        <td>
                          <span className="access-code-chip">
                            {session.access_code}
                            <button
                              className="copy-code-btn"
                              title="Copy access code"
                              onClick={() => {
                                navigator.clipboard.writeText(session.access_code);
                                showToast(`Access code ${session.access_code} copied!`, 'success');
                              }}
                            >
                              <Copy size={12} />
                            </button>
                          </span>
                        </td>

                        {/* 7. Actions Cell (Toolbar) */}
                        <td>
                          <div className="actions-toolbar">
                            <Link
                              href={`/hm/${session.session_uuid}`}
                              className="btn-action btn-action-primary"
                              title="View Candidate DAR Assessment Report"
                            >
                              <BarChart3 size={13} />
                              Report
                            </Link>

                            <button
                              className="btn-action btn-action-secondary"
                              onClick={() => {
                                const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
                                const directLink = `${origin}/candidate/${session.session_uuid}`;
                                const portalLink = `${origin}/candidate-login?email=${encodeURIComponent(session.candidate.email)}&code=${session.access_code}`;
                                const inviteText = `Hello ${session.candidate.full_name},\n\nYou have been invited to an automated technical interview for ${requisition.title}.\n\nDirect One-Click Interview Link:\n${directLink}\n\nCandidate Portal Access:\n${portalLink}\nAccess Code: ${session.access_code}\n\nBest regards,\nXHire Team`;
                                navigator.clipboard.writeText(inviteText);
                                showToast("Interview invite & direct link copied to clipboard!", 'success');
                              }}
                              title="Copy full invitation and direct link"
                            >
                              <Copy size={13} />
                              Copy Invite
                            </button>

                            <Link
                              href={`/schedule/${session.session_uuid}`}
                              className="btn-action btn-action-secondary"
                              title="Manage Interview Scheduling"
                            >
                              <Calendar size={13} />
                              Schedule
                            </Link>

                            <button
                              className="btn-action btn-action-success"
                              onClick={() => handleDownloadPdf(session.session_uuid, session.candidate.full_name)}
                              disabled={downloadingPdfSessionId === session.session_uuid}
                              title="Download Candidate Evaluation PDF"
                            >
                              <Download size={13} />
                              {downloadingPdfSessionId === session.session_uuid ? "..." : "PDF"}
                            </button>

                            <button
                              className="btn-action btn-action-secondary"
                              disabled={resendingId === session.session_uuid}
                              onClick={async () => {
                                try {
                                  setResendingId(session.session_uuid);
                                  await apiClient.post(`/interviews/${session.session_uuid}/resend-invite`);
                                  showToast(`Invitation email successfully resent to ${session.candidate.email}!`, 'success');
                                } catch (err: any) {
                                  showToast(`Failed to resend email: ${err.message}`, 'error');
                                } finally {
                                  setResendingId(null);
                                }
                              }}
                              title="Resend invitation email"
                            >
                              <Send size={13} />
                              {resendingId === session.session_uuid ? "..." : "Resend"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- Invite Candidate Modal --- */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Invite New Candidate</h3>
            <div style={{
              fontSize: '13px',
              color: '#a5b4fc',
              backgroundColor: 'rgba(79, 70, 229, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '18px',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}>
              <Mail size={16} style={{ minWidth: '16px', marginTop: '2px', color: '#818cf8' }} />
              <div>
                <strong>Automatic Email Dispatch:</strong> An email containing the direct interview link and access code will be sent to the candidate immediately.
              </div>
            </div>
            <form onSubmit={handleInvite}>
              <div className="form-group">
                <label htmlFor="name">Candidate Full Name</label>
                <input
                  id="name"
                  type="text"
                  placeholder="e.g. Shreyas Rao"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Candidate Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="e.g. shreyas@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="cv">Candidate CV / Resume</label>
                <div className="cv-input-method-tabs">
                  <button
                    type="button"
                    className={cvInputMethod === "text" ? "active" : ""}
                    onClick={() => setCvInputMethod("text")}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <FileText size={14} />
                    Paste Text
                  </button>
                  <button
                    type="button"
                    className={cvInputMethod === "file" ? "active" : ""}
                    onClick={() => setCvInputMethod("file")}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Upload size={14} />
                    Upload PDF
                  </button>
                </div>

                {cvInputMethod === "file" && (
                  <div style={{ marginBottom: '12px', background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '8px', border: '1px dashed #334155' }}>
                    <input
                      id="cv-file"
                      type="file"
                      accept=".pdf"
                      onChange={handleCvFileChange}
                      disabled={isUploadingCv}
                    />
                    {isUploadingCv && (
                      <p style={{ color: '#38bdf8', fontSize: '13px', margin: '8px 0 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Extracting resume text from PDF...
                      </p>
                    )}
                    {cvFileName && !isUploadingCv && (
                      <div style={{ fontSize: '12px', color: '#34d399', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Check size={14} />
                        Loaded: <strong>{cvFileName}</strong> ({inviteCV.length} characters extracted)
                      </div>
                    )}
                  </div>
                )}

                {cvWarning && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fca5a5',
                    fontSize: '13px',
                    marginBottom: '12px',
                    lineHeight: 1.4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={16} style={{ minWidth: '16px' }} />
                    {cvWarning}
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {cvInputMethod === "file" ? "Extracted Resume Preview (editable):" : "Paste Resume Text:"}
                    </span>
                    {inviteCV && (
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {inviteCV.length} chars
                      </span>
                    )}
                  </div>
                  <textarea
                    id="cv"
                    value={inviteCV}
                    onChange={(e) => setInviteCV(e.target.value)}
                    rows={8}
                    placeholder="Paste candidate's full resume text here, or upload a PDF above..."
                    required
                  />
                </div>
              </div>

              {inviteError && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '16px'
                }}>
                  <AlertTriangle size={18} style={{ minWidth: '18px', marginTop: '2px', color: '#ef4444' }} />
                  <div>
                    <strong style={{ color: '#f87171' }}>Resume Validation Blocked:</strong>
                    <div style={{ marginTop: '2px' }}>{inviteError}</div>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                  disabled={isUploadingCv}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isUploadingCv}
                >
                  {isUploadingCv ? "Parsing PDF..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Auto-Tune JD & Questions Modal --- */}
      <AutoTuneModal
        isOpen={showAutoTuneModal}
        onClose={() => setShowAutoTuneModal(false)}
        requisitionTitle={requisition.title}
        onApplyTuning={(tunedData) => {
          showToast(`Rubrics calibrated and ${tunedData.calibrated_seniority} question bank ready!`, 'success');
        }}
      />
    </div>
  );
}

export default function RequisitionPage() {
  return (
    <ProtectedRoute>
      <RequisitionDetailsContent />
    </ProtectedRoute>
  );
}