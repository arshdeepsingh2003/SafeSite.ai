import { useState, useEffect } from 'react'

const RISK_COLORS = {
  low:      { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  text: '#22c55e', label: 'Low Risk'      },
  medium:   { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.25)', text: '#eab308', label: 'Medium Risk'    },
  high:     { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)', text: '#f97316', label: 'High Risk'    },
  critical: { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',   text: '#ef4444', label: 'Critical Risk' },
}

function Skeleton({ width = '100%', height = '14px', style = {} }) {
  return (
    <div style={{
      width, height,
      background: 'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-card) 50%, var(--bg-hover) 75%)',
      backgroundSize: '200% 100%',
      borderRadius: '4px',
      animation: 'shimmer 1.5s infinite',
      ...style,
    }} />
  )
}

export default function AIInsightPanel({ insight, loading, compact = false }) {
  const [animClass, setAnimClass] = useState('')
  const [prevInsight, setPrevInsight] = useState(null)

  useEffect(() => {
    if (!insight) return
    const insightStr = JSON.stringify(insight)
    const prevStr = prevInsight ? JSON.stringify(prevInsight) : null
    if (prevStr && prevStr !== insightStr) {
      setAnimClass('insight-fade-in')
      const timer = setTimeout(() => setAnimClass(''), 600)
      return () => clearTimeout(timer)
    }
    setPrevInsight(insight)
  }, [insight])

  if (loading) {
    return (
      <div style={{
        background:   'var(--bg-secondary)',
        border:       '1px solid var(--border)',
        borderRadius: '12px',
        padding:      compact ? '14px' : '18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Skeleton width="120px" height="16px" />
          <Skeleton width="60px" height="20px" style={{ borderRadius: '10px' }} />
        </div>
        <Skeleton width="100%" height="13px" style={{ marginBottom: '8px' }} />
        <Skeleton width="85%"  height="13px" style={{ marginBottom: '8px' }} />
        <Skeleton width="70%"  height="13px" />
        <style>{`
          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    )
  }

  if (!insight) {
    return (
      <div style={{
        background:   'var(--bg-secondary)',
        border:       '1px solid var(--border)',
        borderRadius: '12px',
        padding:      compact ? '14px' : '18px',
        textAlign:    'center',
        color:        '#8b949e',
        fontSize:     '13px',
      }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🤖</div>
        No AI insight available yet.<br />
        Start a live stream analysis to generate real-time safety insights.
      </div>
    )
  }

  const risk   = RISK_COLORS[insight.risk_level] || RISK_COLORS.medium
  const isGroq = insight.generated_by === 'groq'

  return (
    <div style={{
      background:   'var(--bg-secondary)',
      border:       `1px solid ${risk.border}`,
      borderRadius: '12px',
      overflow:     'hidden',
      animation:    animClass ? 'insight-fade-in 0.5s ease-out' : 'none',
    }}>

      <style>{`
        @keyframes insight-fade-in {
          0%   { opacity: 0.6; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: compact ? '12px 14px' : '14px 18px',
        borderBottom: `1px solid ${risk.border}`,
        background: risk.bg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#22c55e',
              animation: 'pulse-dot 1.5s infinite',
            }} />
            <span style={{ fontSize: '16px' }}>🤖</span>
          </span>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#e6edf3' }}>
            AI Safety Insight
          </span>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {insight.compliance_percentage && (
            <span style={{
              padding: '3px 8px',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: '8px',
              fontSize: '11px', fontWeight: '700',
              color: '#22c55e',
            }}>
              {insight.compliance_percentage} compliance
            </span>
          )}
          <span style={{
            padding: '4px 12px',
            background: `${risk.text}18`,
            border: `1px solid ${risk.text}40`,
            borderRadius: '12px',
            fontSize: '11px', fontWeight: '700',
            color: risk.text,
          }}>
            {risk.label}
          </span>
        </div>
      </div>

      <div style={{ padding: compact ? '14px' : '18px' }}>

        <p style={{
          fontSize: '13px', color: '#c9d1d9',
          lineHeight: '1.7', marginBottom: compact ? '10px' : '14px',
        }}>
          {insight.insight}
        </p>

        {insight.top_concern && !compact && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            padding: '10px 12px',
            background: `${risk.text}0D`,
            border: `1px solid ${risk.text}30`,
            borderRadius: '8px', marginBottom: '12px',
            fontSize: '12px',
          }}>
            <span style={{ flexShrink: 0, fontSize: '14px' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: '700', color: risk.text, marginBottom: '2px' }}>
                Top Concern
              </div>
              <div style={{ color: '#8b949e' }}>{insight.top_concern}</div>
            </div>
          </div>
        )}

        {insight.recommended_action && !compact && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            padding: '10px 12px',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '8px', marginBottom: '12px',
            fontSize: '12px',
          }}>
            <span style={{ flexShrink: 0, fontSize: '14px' }}>🛠</span>
            <div>
              <div style={{ fontWeight: '700', color: '#818cf8', marginBottom: '2px' }}>
                Recommended Action
              </div>
              <div style={{ color: '#8b949e' }}>{insight.recommended_action}</div>
            </div>
          </div>
        )}

        {insight.trend_analysis && !compact && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            padding: '10px 12px',
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: '8px', marginBottom: '12px',
            fontSize: '12px',
          }}>
            <span style={{ flexShrink: 0, fontSize: '14px' }}>📊</span>
            <div>
              <div style={{ fontWeight: '700', color: '#22c55e', marginBottom: '2px' }}>
                Trend Analysis
              </div>
              <div style={{ color: '#8b949e' }}>{insight.trend_analysis}</div>
            </div>
          </div>
        )}

        {insight.generated_at && (
          <div style={{
            marginTop: compact ? '8px' : '12px',
            fontSize: '10px', color: '#8b949e',
            display: 'flex', alignItems: 'center',
            gap: '6px',
          }}>
            <span>🕐</span>
            Generated {new Date(insight.generated_at).toLocaleTimeString()}
            {insight.note && (
              <span style={{ color: '#22c55e', marginLeft: '6px' }}>
                · {insight.note}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}