'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '../../api';
import type { Requisition, RequisitionCreate } from '../../types';
import Link from 'next/link';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useToast } from '../../context/ToastContext';
import { 
  Briefcase, 
  FolderOpen, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Plus, 
  Pencil, 
  Check, 
  X, 
  ArrowRight, 
  FileText, 
  Upload 
} from 'lucide-react';
import '../../styles/RecruiterDashboard.css';

function DashboardContent() {
  const { showToast } = useToast();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [newReqTitle, setNewReqTitle] = useState("");
  const [newReqAtsId, setNewReqAtsId] = useState("");
  const [newReqJd, setNewReqJd] = useState("");
  const [jdInputMethod, setJdInputMethod] = useState<"text" | "file">("text");
  const [jdFile, setJdFile] = useState<File | null>(null);

  // In-line card ATS ID editing
  const [editingReqId, setEditingReqId] = useState<number | null>(null);
  const [editingAtsIdValue, setEditingAtsIdValue] = useState("");
  const [isUpdatingAtsId, setIsUpdatingAtsId] = useState(false);

  const handleSaveCardAtsId = async (reqId: number) => {
    try {
      setIsUpdatingAtsId(true);
      await apiClient.patch(`/requisitions/${reqId}`, {
        ats_id: editingAtsIdValue.trim() || null,
      });
      showToast(`ATS ID updated to "${editingAtsIdValue.trim() || 'Not Set'}"!`, "success");
      setEditingReqId(null);
      fetchRequisitions(true);
    } catch (err: any) {
      showToast(`Failed to update ATS ID: ${err.message}`, "error");
    } finally {
      setIsUpdatingAtsId(false);
    }
  };

  const handleJdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setJdFile(e.target.files[0]);
    }
  };

  const fetchRequisitions = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
      if (requisitions.length === 0) setLoading(true);
    }
    setError(null);
    try {
      const response = await apiClient.get<Requisition[]>('/requisitions');
      setRequisitions(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        return; // Redirect handled by interceptor
      }
      if (!silent) {
        setError(`Failed to fetch requisitions: ${err.message}`);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequisitions();
    // Auto-refresh recruiter dashboard every 5 seconds
    const interval = setInterval(() => {
      fetchRequisitions(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newReqTitle) {
      alert("Title is required.");
      return;
    }

    let jdText = newReqJd;

    if (jdInputMethod === "file") {
      if (!jdFile) {
        alert("Please select a file.");
        return;
      }

      const formData = new FormData();
      formData.append("file", jdFile);

      try {
        const response = await apiClient.post<{ jd_text: string }>("/requisitions/upload-jd", formData);
        jdText = response.data.jd_text;
      } catch (err: any) {
        setError(`Failed to upload JD: ${err.message}`);
        return;
      }
    }

    if (!jdText) {
      showToast("Job Description is required.", "warning");
      return;
    }

    const newReq: RequisitionCreate = {
      title: newReqTitle,
      jd_text: jdText,
      ats_id: newReqAtsId.trim() || undefined,
    };

    try {
      await apiClient.post<Requisition>('/requisitions', newReq);
      showToast(`Requisition "${newReqTitle}" created successfully!`, 'success');
      setNewReqTitle("");
      setNewReqAtsId("");
      setNewReqJd("");
      setJdFile(null);
      setJdInputMethod("text");
      setShowModal(false);
      fetchRequisitions();
    } catch (err: any) {
      showToast(`Failed to create requisition: ${err.message}`, 'error');
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h2>Recruiter Dashboard</h2>
          <p style={{ color: 'var(--neutral-600)', marginTop: '0.5rem' }}>Manage your requisitions and candidates</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => fetchRequisitions(false)}
            disabled={isRefreshing}
            className="btn-secondary"
            style={{ padding: '0.75rem 1.25rem', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title="Refresh dashboard stats and candidate counts"
          >
            <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={() => setShowModal(true)} className="create-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={18} /> Create Requisition
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-value">{requisitions.length}</div>
            <Briefcase size={22} style={{ color: 'var(--brand-primary)', opacity: 0.85 }} />
          </div>
          <div className="stat-label">Active Requisitions</div>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-value">{requisitions.reduce((acc, req) => acc + (req.status?.toLowerCase() === 'open' ? 1 : 0), 0)}</div>
            <FolderOpen size={22} style={{ color: '#0ea5e9', opacity: 0.85 }} />
          </div>
          <div className="stat-label">Open Positions</div>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-value">{requisitions.reduce((acc, req) => acc + (req.completed_count || 0), 0)}</div>
            <CheckCircle2 size={22} style={{ color: 'var(--color-success, #44D62C)', opacity: 0.85 }} />
          </div>
          <div className="stat-label">Completed Reviews</div>
        </div>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="stat-value">{requisitions.reduce((acc, req) => acc + (req.in_progress_count || 0), 0)}</div>
            <Clock size={22} style={{ color: '#f59e0b', opacity: 0.85 }} />
          </div>
          <div className="stat-label">Active Interviews</div>
        </div>
      </div>

      <div className="req-list-header">
        <h3>Recent Requisitions</h3>
      </div>

      {loading && <p>Loading requisitions...</p>}
      {error && <p className="error-message">{error}</p>}

      {!loading && !error && (
        <div className="req-grid">
          {requisitions.length === 0 ? (
            <div className="empty-state">
              <p>No requisitions found. Create one to get started!</p>
            </div>
          ) : (
            requisitions.map((req) => (
              <div key={req.id} className="req-card">
                <h3>{req.title}</h3>
                <div className="req-details">
                  <div className="req-detail-row">
                    <span className="req-detail-label">Status</span>
                    <span className={`status-badge ${req.status?.toLowerCase() === 'open' ? 'active' : ''}`}>{req.status}</span>
                  </div>
                  <div className="req-detail-row">
                    <span className="req-detail-label">ATS ID</span>
                    {editingReqId === req.id ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input
                          type="text"
                          value={editingAtsIdValue}
                          onChange={(e) => setEditingAtsIdValue(e.target.value)}
                          placeholder="e.g. REQ-1049"
                          style={{
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.8rem',
                            width: '110px',
                            borderRadius: '4px',
                            border: '1px solid var(--brand-primary)',
                            outline: 'none'
                          }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCardAtsId(req.id);
                            if (e.key === 'Escape') setEditingReqId(null);
                          }}
                        />
                        <button
                          onClick={() => handleSaveCardAtsId(req.id)}
                          disabled={isUpdatingAtsId}
                          style={{
                            padding: '0.2rem 0.45rem',
                            fontSize: '0.75rem',
                            background: '#16a34a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                          title="Save ATS ID"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          onClick={() => setEditingReqId(null)}
                          style={{
                            padding: '0.2rem 0.45rem',
                            fontSize: '0.75rem',
                            background: '#e2e8f0',
                            color: '#334155',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                          title="Cancel"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <code style={{ background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '3px', color: '#1e293b' }}>
                          {req.ats_id || 'N/A'}
                        </code>
                        <button
                          onClick={() => {
                            setEditingReqId(req.id);
                            setEditingAtsIdValue(req.ats_id || "");
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--brand-primary)',
                            cursor: 'pointer',
                            padding: '0 0.1rem',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                          title="Click to update ATS ID"
                        >
                          <Pencil size={13} />
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="req-detail-row">
                    <span className="req-detail-label">Candidates</span>
                    <span style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>{req.candidate_count ?? 0}</span>
                  </div>
                </div>
                <Link href={`/recruiter/requisition/${req.id}`} className="view-candidates-link" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  View Details
                  <ArrowRight size={14} />
                </Link>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Requisition</h3>
            <form onSubmit={handleCreateNew}>
              <div className="form-group">
                <label htmlFor="title">Job Title</label>
                <input
                  id="title"
                  type="text"
                  value={newReqTitle}
                  onChange={(e) => setNewReqTitle(e.target.value)}
                  placeholder="e.g., Generative AI Engineer"
                />
              </div>
              <div className="form-group">
                <label htmlFor="ats_id">ATS ID (Optional)</label>
                <input
                  id="ats_id"
                  type="text"
                  value={newReqAtsId}
                  onChange={(e) => setNewReqAtsId(e.target.value)}
                  placeholder="e.g., REQ-2024-089 or Lever / Greenhouse ID"
                />
              </div>
              <div className="form-group">
                <label htmlFor="jd">Job Description</label>
                <div className="jd-input-method-tabs">
                  <button type="button" className={jdInputMethod === "text" ? "active" : ""} onClick={() => setJdInputMethod("text")} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <FileText size={14} /> Text
                  </button>
                  <button type="button" className={jdInputMethod === "file" ? "active" : ""} onClick={() => setJdInputMethod("file")} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Upload size={14} /> File
                  </button>
                </div>
                {jdInputMethod === "text" ? (
                  <textarea
                    id="jd"
                    value={newReqJd}
                    onChange={(e) => setNewReqJd(e.target.value)}
                    rows={10}
                    placeholder="Paste the full job description here..."
                  />
                ) : (
                  <input
                    id="jd-file"
                    type="file"
                    accept=".pdf"
                    onChange={handleJdFileChange}
                  />
                )}
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecruiterPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}