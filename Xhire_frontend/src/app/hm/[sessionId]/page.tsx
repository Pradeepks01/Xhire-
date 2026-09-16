'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '../../../api';
import type { DAR } from '../../../types';
import { SkillRadarChart } from '../../../components/SkillRadarChart';
import { DepthBarChart } from '../../../components/DepthBarChart';
import { ProtectedRoute } from '../../../components/ProtectedRoute';
import { useToast } from '../../../context/ToastContext';
import { 
  FileText, 
  Download, 
  FileCode, 
  X, 
  Award, 
  CheckCircle2, 
  TrendingUp, 
  Sparkles, 
  ShieldCheck, 
  ShieldAlert, 
  BarChart3, 
  Radar,
  AlertTriangle
} from 'lucide-react';
import '../../../styles/HMReport.css';

function HMReportContent() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { showToast } = useToast();
  const [dar, setDar] = useState<DAR | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      if (!sessionId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get<DAR>(
          `/reports/${sessionId}`
        );
        setDar(response.data);
      } catch (err: any) {
        setError(`Failed to fetch report: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [sessionId]);

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!sessionId) return;
    try {
      setIsDownloadingPdf(true);
      showToast("Generating candidate evaluation PDF report...", "info");
      const response = await apiClient.get(`/reports/${sessionId}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const candName = dar?.meta?.candidate_name ? dar.meta.candidate_name.replace(/\s+/g, '_') : 'Candidate';
      link.download = `XHire_Report_${candName}_${sessionId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast("PDF report downloaded successfully!", "success");
    } catch (err: any) {
      showToast(`Failed to download PDF report: ${err.message}`, "error");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadDar = () => {
    if (!dar) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(dar, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `DAR_Report_${sessionId}.json`;
    link.click();
    showToast("Raw DAR JSON exported.", "info");
  };

  if (loading) {
    return <div className="loader">Loading Report...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (!dar || !dar.synthesis) {
    return <p>No synthesis data found for this session.</p>;
  }

  const { synthesis } = dar;

  const radarChartData = synthesis.radar_data 
    ? Object.entries(synthesis.radar_data).map(([category, score]) => ({
        category: category,
        score: score,
      }))
    : [];
  
  let resumeScorePct = "N/A";
  if (synthesis.resume_assessment && synthesis.resume_assessment.suitability_index > 0) {
    const pct = (synthesis.resume_assessment.suitability_index - 1) / 4 * 100;
    resumeScorePct = `${pct.toFixed(0)}%`;
  }

  return (
    <div className="hm-portal-container">
      <header className="hm-header">
        <h2>Interview Report: {synthesis.resume_assessment?.verdict || 'N/A'}</h2>
        <p>Session ID: {sessionId}</p>
        <div className="header-actions">
          <button onClick={() => setShowResume(true)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={15} />
            View Resume
          </button>
          <button
            onClick={handleDownloadPdf}
            className="btn-primary"
            disabled={isDownloadingPdf}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={15} />
            {isDownloadingPdf ? "Generating PDF..." : "Download PDF Report"}
          </button>
          <button onClick={handleDownloadDar} className="btn-secondary" title="Export raw JSON" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileCode size={15} />
            Export JSON
          </button>
        </div>
      </header>

      {/* --- Resume Modal --- */}
      {showResume && (
        <div className="modal-overlay" onClick={() => setShowResume(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} />
                Candidate Resume
              </h3>
              <button onClick={() => setShowResume(false)} className="btn-secondary" style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                <X size={16} />
              </button>
            </div>
            <pre className="resume-text">{dar.inputs?.cv_text || "No resume text found."}</pre>
            <button onClick={() => setShowResume(false)} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <X size={15} />
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- 1. Top-Line "Hype vs. Reality" KPIs --- */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-title">Resume Score (Claim)</div>
            <Award size={20} style={{ color: 'var(--brand-primary)', opacity: 0.8 }} />
          </div>
          <div className="kpi-value">{resumeScorePct}</div>
          <div className="kpi-desc">
            Verdict: {synthesis.resume_assessment?.verdict || 'N/A'}
          </div>
        </div>
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-title">Interview Score (Proof)</div>
            <CheckCircle2 size={20} style={{ color: 'var(--color-success, #44D62C)', opacity: 0.8 }} />
          </div>
          <div className="kpi-value">
            {synthesis.final_score?.toFixed(0) ?? 'N/A'}%
          </div>
          <div className="kpi-desc">Based on AI assessment</div>
        </div>
        <div className="kpi-card gap-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-title">Performance Gap</div>
            <TrendingUp size={20} style={{ color: '#f59e0b', opacity: 0.8 }} />
          </div>
          <div className="kpi-value">
            {synthesis.performance_gap?.toFixed(1) ?? 'N/A'}%
          </div>
          <div className="kpi-desc">Proof vs. Claim</div>
        </div>
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-title">AI Text Integrity</div>
            {(dar as any)?.audit?.ai_integrity?.is_flagged ? (
              <ShieldAlert size={20} style={{ color: '#ef4444' }} />
            ) : (
              <ShieldCheck size={20} style={{ color: '#10b981' }} />
            )}
          </div>
          <div className="kpi-value" style={{ color: (dar as any)?.audit?.ai_integrity?.is_flagged ? '#ef4444' : '#10b981' }}>
            {(dar as any)?.audit?.ai_integrity?.overall_integrity_score != null
              ? `${(dar as any).audit.ai_integrity.overall_integrity_score.toFixed(0)}%`
              : '100%'}
          </div>
          <div className="kpi-desc">
            {(dar as any)?.audit?.ai_integrity?.is_flagged
              ? 'Flagged: Low Burstiness'
              : ((dar as any)?.audit?.ai_integrity?.verdict || 'Human Flow Verified')}
          </div>
        </div>
      </div>

      {/* --- 2. Summaries --- */}
      <div className="summary-grid">
        <div className="summary-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--brand-primary)' }} />
            AI Executive Summary
          </h3>
          {synthesis.summary ? (
            <p style={{ lineHeight: '1.7', color: 'var(--text-body)', fontSize: '15px' }}>
              {synthesis.summary.replace(/<[^>]+>/g, '').trim()}
            </p>
          ) : (
            <p>N/A</p>
          )}
        </div>
        <div className="summary-card safety-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {synthesis.safety_summary ? (
              <ShieldAlert size={18} style={{ color: '#ef4444' }} />
            ) : (
              <ShieldCheck size={18} style={{ color: '#22c55e' }} />
            )}
            Safety & Ethics
          </h3>
          {synthesis.safety_summary ? (
            <p className="safety-warning">{synthesis.safety_summary}</p>
          ) : (
            <p className="safety-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} />
              No safety violations detected.
            </p>
          )}
        </div>
      </div>

      {/* --- 3. Charts --- */}
      <div className="charts-grid">
        <div className="chart-container">
          <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Radar size={18} style={{ color: 'var(--brand-primary)' }} />
            Interview Skill Scores (Radar)
          </h3>
          {radarChartData.length > 0 ? (
            <SkillRadarChart data={radarChartData} />
          ) : (
            <p>No radar data available.</p>
          )}
        </div>
        <div className="chart-container">
          <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <BarChart3 size={18} style={{ color: 'var(--brand-primary)' }} />
            Max Knowledge Depth (Bar)
          </h3>
          {synthesis.depth_data && synthesis.depth_data.length > 0 ? (
            <DepthBarChart data={synthesis.depth_data} />
          ) : (
            <p>No depth data available.</p>
          )}
        </div>
      </div>
      
      {/* --- 4. Resume Pillar Scores --- */}
      <div className="resume-pillars-container">
        <h3>Resume Pillar Assessment</h3>
        <div className="pillars-grid">
        {(synthesis.resume_assessment?.pillar_scores || []).map((pillar) => (
          <div key={pillar.pillar} className="pillar-card">
            <h4>{pillar.pillar}</h4>
            <div className="pillar-score">{pillar.score.toFixed(1)} / 5.0</div>
            <p className="pillar-rationale">{pillar.rationale}</p>
          </div>
        ))}
        </div>
      </div>

      {/* --- 5. AI Detection & Authenticity Analysis --- */}
      <div className="chart-container" style={{ marginTop: '2rem', padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {(dar as any)?.audit?.ai_integrity?.is_flagged ? (
              <AlertTriangle size={20} style={{ color: '#ef4444' }} />
            ) : (
              <ShieldCheck size={20} style={{ color: '#10b981' }} />
            )}
            AI-Generated Text Detection Analysis (Perplexity &amp; Burstiness)
          </h3>
          <span style={{
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.85rem',
            fontWeight: 700,
            background: (dar as any)?.audit?.ai_integrity?.is_flagged ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: (dar as any)?.audit?.ai_integrity?.is_flagged ? '#ef4444' : '#10b981',
            border: `1px solid ${(dar as any)?.audit?.ai_integrity?.is_flagged ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
          }}>
            {(dar as any)?.audit?.ai_integrity?.is_flagged ? 'AI Generated Text Detected' : 'Verified Human Authorship'}
          </span>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '1.5rem' }}>
          Real-time statistical evaluation measuring vocabulary perplexity and sentence length burstiness to verify candidate authenticity and detect text generated by ChatGPT or Claude.
        </p>

        {/* Answer-level breakdown if available */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {((dar.interview_log || []) as any[])
            .filter((item: any) => item.result?.ai_detection)
            .map((item: any, idx: number) => {
              const aiDet = item.result.ai_detection;
              return (
                <div key={item.q_id || idx} style={{
                  background: 'var(--bg-card-secondary, rgba(255,255,255,0.03))',
                  border: `1px solid ${aiDet.is_flagged ? 'rgba(239, 68, 68, 0.35)' : 'var(--border-color)'}`,
                  borderRadius: '10px',
                  padding: '1rem 1.25rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '0.95rem' }}>Q{idx + 1}: {item.question}</strong>
                    <span style={{
                      flexShrink: 0,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '8px',
                      background: aiDet.is_flagged ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                      color: aiDet.is_flagged ? '#ef4444' : '#10b981'
                    }}>
                      {aiDet.is_flagged ? `AI: ${aiDet.ai_probability}%` : `Human: ${aiDet.human_likeness_score}%`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    <em>Answer:</em> &ldquo;{item.user_answer ? item.user_answer.slice(0, 160) + (item.user_answer.length > 160 ? '...' : '') : 'N/A'}&rdquo;
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Perplexity: <strong>{aiDet.perplexity}</strong></span>
                    <span>Burstiness: <strong>{aiDet.burstiness}</strong></span>
                    <span>Sentences: <strong>{aiDet.sentence_count}</strong></span>
                    {aiDet.flags?.map((flag: string, fIdx: number) => (
                      <span key={fIdx} style={{ color: '#f59e0b' }}>⚠️ {flag}</span>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      
    </div>
  );
}

export default function HMReportPage() {
  return (
    <ProtectedRoute>
      <HMReportContent />
    </ProtectedRoute>
  );
}