'use client';

import React, { useState } from 'react';
import { apiClient } from '../api';
import type { AutoTuneJDResponse } from '../types';
import {
  Sparkles,
  Check,
  Copy,
  X,
  Sliders,
  HelpCircle,
  RefreshCw,
  BookOpen
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  requisitionTitle: string;
  onApplyTuning?: (tunedData: AutoTuneJDResponse) => void;
}

export function AutoTuneModal({ isOpen, onClose, requisitionTitle, onApplyTuning }: Props) {
  const [seniority, setSeniority] = useState<string>("Senior");
  const [requirements, setRequirements] = useState<string>(
    `Role: ${requisitionTitle}\nRequirements: Hands-on experience with Python, modern microservices, and system architecture. Experience mentoring developers and handling production escalations.`
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoTuneJDResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'rubrics' | 'questions' | 'jd'>('questions');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleAutoTune = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requirements.trim()) {
      setError("Please provide some requirements or notes to tune.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.post<AutoTuneJDResponse>('/requisitions/auto-tune-jd', {
        raw_requirements: requirements.trim(),
        seniority: seniority,
        focus_areas: []
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to auto-tune JD');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyQuestions = () => {
    if (!result) return;
    let text = `=== AUTO-TUNED QUESTION BANK FOR: ${result.title} (${result.calibrated_seniority}) ===\n\n`;
    Object.entries(result.curated_questions).forEach(([round, questions]) => {
      text += `[${round.toUpperCase()}]\n`;
      questions.forEach((q, idx) => {
        text += `${idx + 1}. ${q}\n`;
      });
      text += '\n';
    });

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={20} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc' }}>
                JD Auto-Tuning & Question Bank Generator
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Seniority calibration, role-calibrated rubric weights, and 3-round persona interview questions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Input Form */}
          <form onSubmit={handleAutoTune} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Target Seniority Level
                </label>
                <select
                  value={seniority}
                  onChange={(e) => setSeniority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                >
                  <option value="Junior">Junior (0-2 Yrs)</option>
                  <option value="Mid">Mid-Level (3-5 Yrs)</option>
                  <option value="Senior">Senior (5-8 Yrs)</option>
                  <option value="Lead">Staff / Principal / Lead (8+ Yrs)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Core Requirements & Focus Areas
                </label>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  rows={3}
                  placeholder="Paste job description, bullets, or notes (e.g. distributed systems, python, mentorship)..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.88rem',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Tuning Rubrics & Generating Questions...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Auto-Tune JD & Questions
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5', fontSize: '0.88rem' }}>
              {error}
            </div>
          )}

          {/* Tuning Result Display */}
          {result && (
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Top Banner */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#818cf8', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Calibrated Role Specification
                  </div>
                  <h4 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', color: '#ffffff' }}>
                    {result.title} &bull; <span style={{ color: '#a78bfa' }}>{result.calibrated_seniority} Seniority</span>
                  </h4>
                </div>
                <button
                  onClick={handleCopyQuestions}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    color: '#e2e8f0',
                    border: '1px solid #334155',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    fontWeight: 600
                  }}
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copied ? "Copied Questions!" : "Copy Question Bank"}
                </button>
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('questions')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'questions' ? '#6366f1' : 'transparent',
                    color: activeTab === 'questions' ? '#ffffff' : '#94a3b8',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <HelpCircle size={14} />
                  Curated Question Banks (3 Rounds)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rubrics')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'rubrics' ? '#6366f1' : 'transparent',
                    color: activeTab === 'rubrics' ? '#ffffff' : '#94a3b8',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sliders size={14} />
                  Calibrated Rubrics & Weights
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('jd')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: activeTab === 'jd' ? '#6366f1' : 'transparent',
                    color: activeTab === 'jd' ? '#ffffff' : '#94a3b8',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <BookOpen size={14} />
                  Calibrated JD Summary
                </button>
              </div>

              {/* Tab 1: Question Banks */}
              {activeTab === 'questions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {Object.entries(result.curated_questions).map(([roundName, questions]) => (
                    <div
                      key={roundName}
                      style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid #334155',
                        borderRadius: '10px',
                        padding: '16px'
                      }}
                    >
                      <h5 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {roundName.replace(/_/g, ' ')}
                      </h5>
                      <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {questions.map((q, qIdx) => (
                          <li key={qIdx} style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 2: Calibrated Rubrics */}
              {activeTab === 'rubrics' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                  {Object.entries(result.rubrics).map(([persona, details]: [string, any]) => (
                    <div
                      key={persona}
                      style={{
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid #334155',
                        borderRadius: '10px',
                        padding: '16px'
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {persona} Round Calibration
                      </div>
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(details.criteria || {}).map(([dim, weight]: [string, any]) => (
                          <div key={dim} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', color: '#cbd5e1', textTransform: 'capitalize' }}>
                              {dim.replace(/_/g, ' ')}
                            </span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8' }}>
                              {weight}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 3: Calibrated JD */}
              {activeTab === 'jd' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(30, 41, 59, 0.5)', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
                  <div>
                    <h5 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase' }}>Summary</h5>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                      {result.summary}
                    </p>
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase' }}>Key Responsibilities</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.88rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {result.responsibilities.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase' }}>Required Skills</h5>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {result.required_skills.map((s, i) => (
                        <span key={i} style={{ padding: '3px 8px', borderRadius: '4px', background: '#1e293b', border: '1px solid #475569', color: '#38bdf8', fontSize: '0.8rem' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: '0.88rem'
            }}
          >
            Close
          </button>
          {result && onApplyTuning && (
            <button
              type="button"
              onClick={() => {
                onApplyTuning(result);
                onClose();
              }}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                background: '#10b981',
                color: '#064e3b',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Check size={16} />
              Apply Tuning to Requisition
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
