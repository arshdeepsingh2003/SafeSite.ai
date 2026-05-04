// ============================================================
// SafeSite AI — Analysis Result Card
// File: frontend/src/components/ui/AnalysisResultCard.jsx
//
// Displays the AI detection results for an analyzed video.
// Shows: compliance rate, worker counts, violation breakdown.
// ============================================================

export default function AnalysisResultCard({ summary, videoName }) {
  if (!summary) return null

  const {
    avg_workers_per_frame   = 0,
    compliance_rate         = 0,
    avg_violations_per_frame = 0,
    peak_violations         = 0,
    total_violation_events  = 0,
  } = summary

  // Colour for compliance rate
  const complianceColor =
    compliance_rate >= 80 ? '#22c55e' :
    compliance_rate >= 60 ? '#eab308' : '#ef4444'

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      marginTop: '16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{
          width: '32px', height: '32px',
          background: 'rgba(99,102,241,0.2)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>🤖</div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>
            AI Analysis Complete
          </div>
          {videoName && (
            <div style={{ fontSize: '11px', color: '#8b949e' }}>{videoName}</div>
          )}
        </div>
        <div style={{
          marginLeft: 'auto', padding: '4px 10px',
          background: 'rgba(34,197,94,0.15)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '12px', fontSize: '11px', color: '#22c55e', fontWeight: '600',
        }}>
          ✅ Completed
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
        {/* Compliance Rate — big centrepiece */}
        <div style={{
          gridColumn: '1 / -1',
          padding: '14px', textAlign: 'center',
          background: 'var(--bg-primary)',
          borderRadius: '10px', border: `1px solid ${complianceColor}40`,
        }}>
          <div style={{ fontSize: '32px', fontWeight: '800', color: complianceColor, lineHeight: 1 }}>
            {compliance_rate}%
          </div>
          <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '4px' }}>
            Overall Compliance Rate
          </div>
        </div>

        <StatCell
          icon="👷" label="Avg Workers/Frame"
          value={avg_workers_per_frame} color="#3b82f6"
        />
        <StatCell
          icon="⚠️" label="Avg Violations/Frame"
          value={avg_violations_per_frame} color="#f97316"
        />
        <StatCell
          icon="🔴" label="Peak Violations"
          value={peak_violations} color="#ef4444"
        />
      </div>

      {/* Total events */}
      <div style={{
        padding: '10px 14px',
        background: total_violation_events > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
        border: `1px solid ${total_violation_events > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
        borderRadius: '8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '13px', color: '#e6edf3' }}>
          Total violation events detected
        </span>
        <span style={{
          fontSize: '18px', fontWeight: '700',
          color: total_violation_events > 0 ? '#ef4444' : '#22c55e',
        }}>
          {total_violation_events}
        </span>
      </div>
    </div>
  )
}

function StatCell({ icon, label, value, color }) {
  return (
    <div style={{
      padding: '12px', textAlign: 'center',
      background: 'var(--bg-primary)',
      borderRadius: '8px', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '18px', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '10px', color: '#8b949e', marginTop: '4px', lineHeight: 1.3 }}>
        {label}
      </div>
    </div>
  )
}