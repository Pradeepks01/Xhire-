'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip
} from 'recharts';
import { apiClient } from '../api';
import type { CandidateMatrixResponse } from '../types';
import {
  Trophy,
  TrendingUp,
  BarChart2,
  Users,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Award
} from 'lucide-react';

interface Props {
  reqId: string;
}

const CANDIDATE_COLORS = [
  { stroke: '#3b82f6', fill: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', name: 'Blue' },
  { stroke: '#10b981', fill: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', name: 'Green' },
  { stroke: '#f59e0b', fill: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', name: 'Amber' },
  { stroke: '#ec4899', fill: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', name: 'Pink' },
];

export function CandidateMatrixView({ reqId }: Props) {
  const [matrixData, setMatrixData] = useState<CandidateMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
  const [showBenchmark, setShowBenchmark] = useState(true);

  const fetchMatrix = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<CandidateMatrixResponse>(`/requisitions/${reqId}/candidate-matrix`);
      setMatrixData(res.data);
      setError(null);

      // Default select up to top 2-3 candidates for initial radar comparison
      if (res.data.leaderboard.length > 0) {
        const topUuids = res.data.leaderboard.slice(0, 3).map(c => c.session_uuid);
        setSelectedUuids(topUuids);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load candidate matrix');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reqId) {
      fetchMatrix();
    }
  }, [reqId]);

  const toggleCandidateSelection = (uuid: string) => {
    if (selectedUuids.includes(uuid)) {
      setSelectedUuids(selectedUuids.filter(id => id !== uuid));
    } else {
      if (selectedUuids.length >= 4) {
        alert('You can compare up to 4 candidates simultaneously on the radar overlay.');
        return;
      }
      setSelectedUuids([...selectedUuids, uuid]);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
        <p>Computing empirical percentiles and comparative matrix...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5' }}>
        <p><strong>Error loading candidate matrix:</strong> {error}</p>
        <button onClick={fetchMatrix} style={{ marginTop: '12px', padding: '6px 14px', borderRadius: '6px', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!matrixData || matrixData.leaderboard.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', border: '1px dashed #334155' }}>
        <Users size={40} style={{ color: '#64748b', marginBottom: '12px' }} />
        <h4 style={{ margin: '0 0 8px 0', color: '#e2e8f0' }}>No Candidate Matrix Available Yet</h4>
        <p style={{ color: '#94a3b8', maxWidth: '460px', margin: '0 auto', fontSize: '0.9rem' }}>
          Invite candidates and conduct interviews to populate comparative percentiles, rank leaderboards, and overlay skill radar charts.
        </p>
      </div>
    );
  }

  // Build multi-radar chart dataset
  const selectedCandidates = matrixData.leaderboard.filter(c => selectedUuids.includes(c.session_uuid));
  
  const radarChartData = matrixData.radar_categories.map(cat => {
    const row: Record<string, any> = { category: cat };
    if (showBenchmark && matrixData.category_averages[cat] !== undefined) {
      row['Cohort Average'] = matrixData.category_averages[cat];
    }
    selectedCandidates.forEach(cand => {
      row[cand.candidate_name] = cand.scores[cat] ?? 0;
    });
    return row;
  });

  const getPercentileBadge = (percentile: number, categoryName: string) => {
    if (percentile >= 90) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          background: 'rgba(234, 179, 8, 0.18)',
          color: '#eab308',
          border: '1px solid rgba(234, 179, 8, 0.4)'
        }}>
          ★ Top {Math.max(1, 100 - Math.round(percentile))}% in {categoryName}
        </span>
      );
    }
    if (percentile >= 75) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          background: 'rgba(59, 130, 246, 0.15)',
          color: '#60a5fa',
          border: '1px solid rgba(59, 130, 246, 0.3)'
        }}>
          Top {100 - Math.round(percentile)}% {categoryName}
        </span>
      );
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* KPI Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc' }}>
              {matrixData.total_candidates}
            </span>
            <Users size={20} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
            Total Requisition Pool
          </div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
              {matrixData.leaderboard[0] ? `${matrixData.leaderboard[0].overall_score.toFixed(0)}%` : 'N/A'}
            </span>
            <Trophy size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
            Highest Score ({matrixData.leaderboard[0]?.candidate_name || 'None'})
          </div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#818cf8' }}>
              {(
                matrixData.leaderboard.reduce((acc, c) => acc + c.overall_score, 0) /
                (matrixData.leaderboard.length || 1)
              ).toFixed(1)}%
            </span>
            <BarChart2 size={20} color="#818cf8" />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
            Cohort Score Benchmark
          </div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>
              {matrixData.completed_candidates}
            </span>
            <CheckCircle2 size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
            Evaluations Completed
          </div>
        </div>
      </div>

      {/* Multi-Candidate Comparative Radar Overlay */}
      <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #334155', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={20} color="#38bdf8" />
              Comparative Radar Overlay
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Cross-compare candidate dimensional profiles against each other and against the requisition cohort average.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showBenchmark}
                onChange={(e) => setShowBenchmark(e.target.checked)}
              />
              Show Cohort Benchmark
            </label>
          </div>
        </div>

        {/* Selected Candidates Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {selectedCandidates.length === 0 && (
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
              Select candidates from the leaderboard below to overlay their radar charts.
            </span>
          )}
          {selectedCandidates.map((cand, idx) => {
            const color = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];
            return (
              <span
                key={cand.session_uuid}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  background: color.bg,
                  color: color.stroke,
                  border: `1px solid ${color.stroke}`
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color.stroke }} />
                #{cand.rank} {cand.candidate_name} ({cand.overall_score.toFixed(0)}%)
                <button
                  onClick={() => toggleCandidateSelection(cand.session_uuid)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: color.stroke,
                    cursor: 'pointer',
                    fontSize: '12px',
                    marginLeft: '2px',
                    padding: 0
                  }}
                  title="Remove from overlay"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>

        <div style={{ width: '100%', height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarChartData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="category" stroke="#94a3b8" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#475569" tick={{ fill: '#64748b', fontSize: 10 }} />
              
              {showBenchmark && (
                <Radar
                  name="Cohort Average"
                  dataKey="Cohort Average"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.15}
                  strokeDasharray="4 4"
                />
              )}

              {selectedCandidates.map((cand, idx) => {
                const color = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];
                return (
                  <Radar
                    key={cand.session_uuid}
                    name={`#${cand.rank} ${cand.candidate_name}`}
                    dataKey={cand.candidate_name}
                    stroke={color.stroke}
                    fill={color.fill}
                    fillOpacity={0.25}
                  />
                );
              })}

              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  color: '#f8fafc',
                  borderRadius: '8px',
                  fontSize: '0.85rem'
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Leaderboard Callouts */}
      {Object.keys(matrixData.top_strengths).length > 0 && (
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #334155', borderRadius: '12px', padding: '18px 24px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Award size={16} color="#f59e0b" />
            Top Domain Performers in This Requisition
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {Object.entries(matrixData.top_strengths).map(([cat, leader]) => (
              <div
                key={cat}
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px 14px'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {cat}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 600, marginTop: '2px' }}>
                  {leader}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Percentile Ranked Leaderboard Table */}
      <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #334155', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc' }}>
              Percentile Leaderboard
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Statistical rankings across the candidate pool with percentile highlights in key dimensions.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #334155', color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 10px' }}>Compare</th>
                <th style={{ padding: '12px 10px' }}>Rank</th>
                <th style={{ padding: '12px 10px' }}>Candidate</th>
                <th style={{ padding: '12px 10px' }}>Overall Score</th>
                <th style={{ padding: '12px 10px' }}>Cohort Percentile</th>
                <th style={{ padding: '12px 10px' }}>Dimensional Strengths</th>
                <th style={{ padding: '12px 10px' }}>AI Authenticity</th>
                <th style={{ padding: '12px 10px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {matrixData.leaderboard.map((cand) => {
                const isSelected = selectedUuids.includes(cand.session_uuid);
                const rankBadgeColor =
                  cand.rank === 1 ? '#eab308' :
                  cand.rank === 2 ? '#cbd5e1' :
                  cand.rank === 3 ? '#b45309' : '#64748b';

                const standoutBadges = Object.entries(cand.percentiles)
                  .filter((entry) => entry[1] >= 75)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 2);

                return (
                  <tr
                    key={cand.session_uuid}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '12px 10px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCandidateSelection(cand.session_uuid)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: rankBadgeColor,
                        border: `2px solid ${rankBadgeColor}`,
                        background: 'rgba(15, 23, 42, 0.5)'
                      }}>
                        #{cand.rank}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{cand.candidate_name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{cand.candidate_email}</div>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: cand.overall_score >= 75 ? '#10b981' : cand.overall_score >= 60 ? '#f59e0b' : '#ef4444' }}>
                        {cand.overall_score.toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          flex: 1,
                          height: '6px',
                          background: '#1e293b',
                          borderRadius: '3px',
                          overflow: 'hidden',
                          width: '60px'
                        }}>
                          <div
                            style={{
                              width: `${cand.percentile}%`,
                              height: '100%',
                              background: cand.percentile >= 80 ? '#10b981' : '#38bdf8'
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>
                          {cand.percentile.toFixed(0)}th %ile
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {standoutBadges.length > 0 ? (
                          standoutBadges.map(([cat, pct]) => (
                            <React.Fragment key={cat}>
                              {getPercentileBadge(pct, cat)}
                            </React.Fragment>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Balanced</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      {cand.is_ai_flagged ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)'
                          }}
                        >
                          <AlertTriangle size={12} />
                          AI Flagged
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)'
                          }}
                        >
                          <ShieldCheck size={12} />
                          Human {cand.ai_integrity_score.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Link
                          href={`/hm/${cand.session_uuid}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: '#1e293b',
                            color: '#e2e8f0',
                            border: '1px solid #334155',
                            textDecoration: 'none'
                          }}
                        >
                          DAR Report
                          <ExternalLink size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
