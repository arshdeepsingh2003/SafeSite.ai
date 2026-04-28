// ============================================================
// SafeSite AI — Dashboard Page (Phase 10 — Full Integration)
// File: frontend/src/components/pages/DashboardPage.jsx
// ============================================================

import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../services/api'

// ── Stat Card ─────────────────────────────────
function StatCard({ icon, label, value, sub, subColor = '#22c55e' }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: '16px', flex: 1,
    }}>
      <div style={{
        width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0,
        background: 'var(--bg-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '26px', fontWeight: '700', color: '#e6edf3', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '11px', color: subColor, marginTop: '3px' }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  // ── Fetch dashboard stats ──────────────────────────
  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 30000)
    return () => clearInterval(id)
  }, [])

  async function loadStats() {
    try {
      const res = await api.get('/dashboard/stats')
      const d = res.data
      setStats(d.stats)
    } catch (err) {
      console.error('Dashboard stats failed:', err)
      if (!stats) {
        setStats({
          total_workers: 0,
          compliant: 0,
          no_helmet: 0,
          no_vest: 0,
          both_missing: 0,
          compliance_rate: 0,
          change_pct: 0,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const compRate = stats?.compliance_rate ?? 0

  return (
    <div>
      {/* ── 5 Stat Cards ── */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <StatCard icon="👥" label="Total Workers Detected"
          value={loading ? '—' : stats?.total_workers ?? 0}
          sub={stats?.change_pct >= 0 ? `↑ ${stats?.change_pct}% vs yesterday` : `↓ ${Math.abs(stats?.change_pct ?? 0)}% vs yesterday`}
          subColor={stats?.change_pct >= 0 ? '#22c55e' : '#ef4444'} />
        <StatCard icon="✅" label="Compliant (Safe)"
          value={loading ? '—' : stats?.compliant ?? 0}
          sub={`${compRate}% of total`} subColor="#22c55e" />
        <StatCard icon="⛑️" label="No Helmet"
          value={loading ? '—' : stats?.no_helmet ?? 0}
          sub={stats ? `${((stats.no_helmet / Math.max(stats.total_workers, 1)) * 100).toFixed(1)}% of total` : ''}
          subColor="#f97316" />
        <StatCard icon="🦺" label="No Vest"
          value={loading ? '—' : stats?.no_vest ?? 0}
          sub={stats ? `${((stats.no_vest / Math.max(stats.total_workers, 1)) * 100).toFixed(1)}% of total` : ''}
          subColor="#eab308" />
        <StatCard icon="🚫" label="No Helmet & No Vest"
          value={loading ? '—' : stats?.both_missing ?? 0}
          sub={stats ? `${((stats.both_missing / Math.max(stats.total_workers, 1)) * 100).toFixed(1)}% of total` : ''}
          subColor="#a855f7" />
      </div>

      {/* Info message about missing features */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '12px', padding: '20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>🛠️</div>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3', marginBottom: '8px' }}>
          Dashboard Partially Loaded
        </div>
        <div style={{ fontSize: '13px', color: '#8b949e', maxWidth: '500px', margin: '0 auto' }}>
          Features not yet available: Live monitoring video, alerts panel, violation trends, compliance charts, and AI insights.
          These require additional packages (recharts, hls.js) and components (SocketContext, SoundContext, LiveAIInsight) to be implemented.
        </div>
      </div>
    </div>
  )
}
