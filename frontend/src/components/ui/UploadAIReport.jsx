import { useState } from 'react'

const RISK_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', label: 'Critical Risk', icon: '🔴' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)', label: 'High Risk', icon: '🟠' },
  medium:   { color: '#eab308', bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)', label: 'Medium Risk', icon: '🟡' },
  low:      { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', label: 'Low Risk', icon: '🟢' },
}

const VIOLATION_TYPE_CONFIG = {
  no_helmet:   { color: '#f97316', label: 'No Hard Hat' },
  no_vest:     { color: '#eab308', label: 'No Safety Vest' },
  both_missing: { color: '#ef4444', label: 'No Helmet & No Vest' },
}

function SkeletonBlock({ width = '100%', height = '14px' }) {
  return (
    <div style={{
      width, height,
      background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-card) 50%, var(--bg-hover) 75%)',
      backgroundSize: '200% 100%',
      borderRadius: '6px',
      animation: 'shimmer-report 1.5s infinite',
      marginBottom: '8px',
    }} />
  )
}

function ReportSkeleton() {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '24px',
    }}>
      <SkeletonBlock width="180px" height="20px" />
      <SkeletonBlock width="100%" height="60px" />
      <div style={{ display: 'flex', gap: '12px', margin: '16px 0' }}>
        <SkeletonBlock width="50%" height="80px" />
        <SkeletonBlock width="50%" height="80px" />
      </div>
      <SkeletonBlock width="100%" height="40px" />
      <SkeletonBlock width="100%" height="40px" />
      <SkeletonBlock width="70%" height="14px" />
      <style>{`
        @keyframes shimmer-report {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

export default function UploadAIReport({ report, loading, videoName }) {
  const [expanded, setExpanded] = useState(false)
  const [showFullReport, setShowFullReport] = useState(false)

  if (loading) return <ReportSkeleton />

  if (!report) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '10px' }}>📋</div>
        <div style={{ fontSize: '14px', color: '#8b949e' }}>
          No AI audit report available. Analyze a video to generate a professional safety report.
        </div>
      </div>
    )
  }

  const risk = RISK_CONFIG[report.risk_score] || RISK_CONFIG.medium
  const complianceScore = report.compliance_score ?? 0
  const complianceColor = complianceScore >= 80 ? '#22c55e' : complianceScore >= 60 ? '#eab308' : '#ef4444'
  const isGroq = report.generated_by === 'groq'
  const violations = report.key_violations || []
  const recommendations = report.recommendations || []

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: `1px solid ${risk.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: `1px solid ${risk.border}`,
        background: risk.bg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'rgba(99,102,241,0.2)',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px',
          }}>📋</div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#e6edf3' }}>
              AI Safety Audit Report
            </div>
            {videoName && (
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                {videoName}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {report.from_cache && (
            <span style={{
              padding: '2px 8px',
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: '10px',
              fontSize: '10px', fontWeight: '700', color: '#3b82f6',
            }}>
              Cached
            </span>
          )}
          <span style={{
            padding: '2px 8px',
            background: isGroq ? 'rgba(99,102,241,0.2)' : 'rgba(139,92,246,0.15)',
            border: `1px solid ${isGroq ? 'rgba(99,102,241,0.4)' : 'rgba(139,92,246,0.3)'}`,
            borderRadius: '10px',
            fontSize: '10px', fontWeight: '700',
            color: isGroq ? '#818cf8' : '#a78bfa',
          }}>
            {isGroq ? 'Groq AI' : 'Rule-Based'}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '20px' }}>

        {/* ── Executive Summary ── */}
        <div style={{
          padding: '14px 16px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '12px', fontWeight: '700', color: '#e6edf3',
            marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span>📝</span> Executive Summary
          </div>
          <p style={{
            fontSize: '13px', color: '#c9d1d9',
            lineHeight: '1.7', margin: 0,
          }}>
            {report.executive_summary}
          </p>
        </div>

        {/* ── Score Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            padding: '16px', textAlign: 'center',
            background: 'var(--bg-primary)',
            border: `1px solid ${complianceColor}40`,
            borderRadius: '10px',
          }}>
            <div style={{ fontSize: '28px', fontWeight: '800', color: complianceColor, lineHeight: 1 }}>
              {complianceScore}%
            </div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>
              Compliance Score
            </div>
          </div>

          <div style={{
            padding: '16px', textAlign: 'center',
            background: `${risk.bg}`,
            border: `1px solid ${risk.border}`,
            borderRadius: '10px',
          }}>
            <div style={{ fontSize: '13px', marginBottom: '4px' }}>{risk.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: risk.color, lineHeight: 1 }}>
              {risk.label}
            </div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '4px' }}>
              Risk Score
            </div>
          </div>
        </div>

        {/* ── Key Violations ── */}
        {violations.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: '#e6edf3',
              marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span>⚠️</span> Key Violations
            </div>
            {violations.map((v, i) => {
              const vConfig = VIOLATION_TYPE_CONFIG[v.type] || { color: '#8b949e', label: v.type }
              const sevColor = v.severity === 'critical' ? '#ef4444' : v.severity === 'high' ? '#f97316' : '#eab308'
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '10px 12px',
                  background: `${vConfig.color}10`,
                  border: `1px solid ${vConfig.color}30`,
                  borderRadius: '8px', marginBottom: '6px',
                }}>
                  <div style={{
                    width: '28px', height: '28px', flexShrink: 0,
                    background: `${vConfig.color}18`,
                    borderRadius: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px',
                  }}>
                    {v.type === 'no_helmet' ? '⛑️' : v.type === 'no_vest' ? '🦺' : '🚨'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>
                        {vConfig.label}
                      </span>
                      <span style={{
                        padding: '1px 7px', borderRadius: '8px',
                        background: `${sevColor}20`,
                        color: sevColor, fontSize: '10px', fontWeight: '700',
                      }}>
                        {v.count} incidents
                      </span>
                      <span style={{
                        padding: '1px 7px', borderRadius: '8px',
                        background: `${sevColor}15`,
                        color: sevColor, fontSize: '10px', fontWeight: '600',
                      }}>
                        {v.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>
                      {v.description}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Recommendations ── */}
        {recommendations.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: '#e6edf3',
              marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span>🛠</span> Recommendations
            </div>
            {recommendations.map((rec, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                padding: '9px 12px',
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: '8px', marginBottom: '6px',
              }}>
                <span style={{
                  width: '20px', height: '20px', flexShrink: 0,
                  background: 'rgba(99,102,241,0.15)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: '700', color: '#818cf8',
                }}>{i + 1}</span>
                <span style={{ fontSize: '12px', color: '#c9d1d9', lineHeight: 1.5 }}>
                  {rec}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Trend Analysis ── */}
        {report.trend_analysis && (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(34,197,94,0.05)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: '8px', marginBottom: '16px',
          }}>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: '#22c55e',
              marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span>📊</span> Trend Analysis
            </div>
            <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>
              {report.trend_analysis}
            </p>
          </div>
        )}

        {/* ── Repeated Offenders ── */}
        {report.repeated_offenders_analysis && (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(249,115,22,0.05)',
            border: '1px solid rgba(249,115,22,0.2)',
            borderRadius: '8px', marginBottom: '16px',
          }}>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: '#f97316',
              marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span>🔄</span> Repeat Offender Analysis
            </div>
            <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>
              {report.repeated_offenders_analysis}
            </p>
          </div>
        )}

        {/* ── Detection Quality Note ── */}
        {report.detection_quality_note && (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(59,130,246,0.05)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: '8px', marginBottom: '16px',
          }}>
            <div style={{
              fontSize: '12px', fontWeight: '700', color: '#3b82f6',
              marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <span>🎯</span> Detection Quality
            </div>
            <p style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>
              {report.detection_quality_note}
            </p>
          </div>
        )}

        {/* ── Expandable Detail ── */}
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '12px',
        }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#8b949e', fontSize: '12px',
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 0',
              width: '100%',
            }}
          >
            <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
            {expanded ? 'Hide technical details' : 'Show technical details'}
          </button>

          {expanded && (
            <div style={{
              marginTop: '10px',
              padding: '12px',
              background: 'var(--bg-primary)',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#8b949e',
              lineHeight: 1.8,
            }}>
              <div><strong style={{ color: '#6b7280' }}>AI Engine:</strong> {isGroq ? report.model || 'Groq LLM' : 'Rule-based fallback'}</div>
              <div><strong style={{ color: '#6b7280' }}>AI Confidence:</strong> {report.ai_confidence || 'N/A'}</div>
              <div><strong style={{ color: '#6b7280' }}>Report Type:</strong> {report.report_type || 'uploaded_video_audit'}</div>
              <div><strong style={{ color: '#6b7280' }}>Generated At:</strong> {report.generated_at ? new Date(report.generated_at).toLocaleString() : 'N/A'}</div>
              <div><strong style={{ color: '#6b7280' }}>Severity Level:</strong> {report.severity_level || 'N/A'}</div>
              {report.from_cache && (
                <div><strong style={{ color: '#3b82f6' }}>Cached:</strong> Loaded from saved report (no regeneration needed)</div>
              )}
            </div>
          )}
        </div>

        {/* ── Raw JSON toggle ── */}
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={() => setShowFullReport(!showFullReport)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6b7280', fontSize: '11px',
              padding: '2px 0',
            }}
          >
            {showFullReport ? 'Hide raw data' : 'View raw report data'}
          </button>
          {showFullReport && (
            <pre style={{
              marginTop: '8px', padding: '12px',
              background: '#0d1117', borderRadius: '8px',
              fontSize: '10px', color: '#8b949e',
              maxHeight: '300px', overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {JSON.stringify(report, null, 2)}
            </pre>
          )}
        </div>

      </div>
    </div>
  )
}
