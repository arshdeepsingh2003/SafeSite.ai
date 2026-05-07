// ============================================================
// SafeSite AI — Alerts Page  (Phase 5)
// File: frontend/src/components/pages/AlertsPage.jsx
//
// Features:
//   - 4 summary stat cards (total, no helmet, no vest, both)
//   - Filterable table (zone, severity, status, type)
//   - Pagination
//   - Per-row: acknowledge / resolve / delete actions
//   - "Mark all as read" button
//   - Violation trend chart (right panel)
//   - Auto-refresh every 15 seconds
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { useAlertContext } from '../../context/AlertContext'

// ── Constants ────────────────────────────────────────────────

const SEVERITY_STYLE = {
  high:   { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', border: 'rgba(239,68,68,0.3)'  },
  medium: { bg: 'rgba(234,179,8,0.15)',  color: '#eab308', border: 'rgba(234,179,8,0.3)'  },
  low:    { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
}

const STATUS_STYLE = {
  new:          { color: '#ef4444', dot: '#ef4444',  label: '● New'          },
  acknowledged: { color: '#3b82f6', dot: '#3b82f6',  label: '◆ Acknowledged' },
  resolved:     { color: '#22c55e', dot: '#22c55e',  label: '✓ Resolved'     },
}

const VIOLATION_META = {
  no_helmet:             { icon: '⛑️',  label: 'No Helmet',          color: '#f97316' },
  no_vest:               { icon: '🦺', label: 'No Vest',             color: '#eab308' },
  no_helmet_and_no_vest: { icon: '🚨', label: 'No Helmet & No Vest', color: '#ef4444' },
}

// ── Mock trend data (replaced by real data in Phase 6) ──────
const MOCK_TREND = Array.from({ length: 13 }, (_, i) => ({
  time:   `${String(i * 2).padStart(2, '0')}:00`,
  helmet: Math.floor(Math.random() * 18) + 2,
  vest:   Math.floor(Math.random() * 12) + 1,
  both:   Math.floor(Math.random() * 6)  + 1,
}))

// ── Small reusable components ────────────────────────────────

function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLE[severity] || SEVERITY_STYLE.medium
  return (
    <span style={{
      fontSize: '11px', fontWeight: '700', padding: '3px 10px',
      borderRadius: '12px', background: s.bg,
      color: s.color, border: `1px solid ${s.border}`,
      textTransform: 'capitalize',
    }}>{severity}</span>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.new
  return (
    <span style={{ fontSize: '12px', color: s.color, fontWeight: '500' }}>
      {s.label}
    </span>
  )
}

function StatCard({ icon, value, label, subtext, color, bg }) {
  return (
    <div style={{
      background: bg || 'var(--bg-secondary)',
      border: `1px solid ${color}30`,
      borderRadius: '12px', padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      <div style={{
        width: '44px', height: '44px', flexShrink: 0,
        background: `${color}18`, border: `1px solid ${color}30`,
        borderRadius: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '26px', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '12px', color: '#e6edf3', fontWeight: '500', marginTop: '3px' }}>{label}</div>
        {subtext && (
          <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '2px' }}>{subtext}</div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function AlertsPage() {
  const [alerts,      setAlerts]      = useState([])
  const [summary,     setSummary]     = useState({ total: 0, no_helmet: 0, no_vest: 0, no_helmet_and_no_vest: 0 })
  const [loading,     setLoading]     = useState(true)
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const [actionLoading, setActionLoading] = useState(null) // alert id being acted on

  // Filters
  const [filterZone,      setFilterZone]      = useState('all')
  const [filterSeverity,  setFilterSeverity]  = useState('all')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [filterViolation, setFilterViolation] = useState('all')

  const LIMIT = 7
  const { refreshCount } = useAlertContext()

  // ── Fetch alerts ──────────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        zone:      filterZone,
        severity:  filterSeverity,
        status:    filterStatus,
        violation: filterViolation,
        limit:     LIMIT,
        skip:      (page - 1) * LIMIT,
      })
      const [alertsRes, summaryRes] = await Promise.all([
        api.get(`/alerts?${params}`),
        api.get('/alerts/summary'),
      ])
      setAlerts(alertsRes.data.alerts)
      setTotal(alertsRes.data.total)
      setSummary(summaryRes.data)
    } catch (err) {
      toast.error('Could not load alerts')
    } finally {
      setLoading(false)
    }
  }, [filterZone, filterSeverity, filterStatus, filterViolation, page])

  // Only poll if user is logged in (token exists)
  const token = localStorage.getItem('safesite_token')

  // Load on mount and every 15 seconds
  useEffect(() => {
    if (!token) return // Don't poll if not authenticated

    fetchAlerts()
    const interval = setInterval(fetchAlerts, 15000)
    return () => clearInterval(interval)
  }, [fetchAlerts, token])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [filterZone, filterSeverity, filterStatus, filterViolation])

  // ── Actions ───────────────────────────────────────────────
  async function handleStatusChange(alertId, newStatus) {
    setActionLoading(alertId)
    try {
      await api.patch(`/alerts/${alertId}/status`, { status: newStatus })
      toast.success(`Alert marked as "${newStatus}"`)
      fetchAlerts()
    } catch (err) {
      toast.error('Could not update alert')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(alertId) {
    if (!window.confirm('Delete this alert permanently?')) return
    setActionLoading(alertId)
    try {
      await api.delete(`/alerts/${alertId}`)
      toast.success('Alert deleted')
      fetchAlerts()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not delete alert')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResolveAll() {
    if (!window.confirm('Mark ALL alerts as resolved?')) return
    try {
      const res = await api.post('/alerts/resolve-all')
      toast.success(res.data.message)
      refreshCount()
      fetchAlerts()
    } catch (err) {
      toast.error('Could not resolve all alerts')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // ── Render ───────────────────────────────────────────────
  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
          Dashboard › Alerts
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Alerts</h1>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>

        {/* ── LEFT: Main content ── */}
        <div>

          {/* ── Filter bar ── */}
          <div style={{
            display: 'flex', gap: '10px', marginBottom: '20px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px 16px', flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            {/* Date (visual only for now) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 12px', background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: '7px',
              fontSize: '13px', color: '#e6edf3', cursor: 'pointer',
            }}>
              📅 {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>

            {/* Zone filter */}
            <select
              value={filterZone}
              onChange={e => setFilterZone(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Zones</option>
              {['Zone A','Zone B','Zone C','Zone D'].map(z => <option key={z}>{z}</option>)}
            </select>

            {/* Violation type filter */}
            <select
              value={filterViolation}
              onChange={e => setFilterViolation(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Alert Types</option>
              <option value="no_helmet">No Helmet</option>
              <option value="no_vest">No Vest</option>
              <option value="no_helmet_and_no_vest">No Helmet &amp; No Vest</option>
            </select>

            {/* Severity filter */}
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>

            {/* Status filter */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>

            {/* Export button (visual) */}
            <button style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px',
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: '7px', color: '#8b949e', fontSize: '13px', cursor: 'pointer',
            }}>
              ⬇ Export
            </button>
          </div>

          {/* ── Stat cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
            <StatCard icon="⚠️" value={summary.total}                    label="Total Alerts"/>
            <StatCard icon="⛑️"  value={summary.no_helmet}               label="No Helmet"/>
            <StatCard icon="🦺" value={summary.no_vest}                  label="No Vest" />
            <StatCard icon="🚨" value={summary.no_helmet_and_no_vest}    label="No Helmet & No Vest" />
          </div>

          {/* ── Alerts table ── */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '12px', overflow: 'hidden',
          }}>
            {/* Table header bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3' }}>
                All Alerts
              </span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={fetchAlerts}
                  style={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '5px 10px',
                    color: '#8b949e', fontSize: '12px', cursor: 'pointer',
                  }}
                  title="Refresh"
                >🔄</button>
                <button
                  onClick={handleResolveAll}
                  style={{
                    background: 'transparent', border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: '6px', padding: '5px 12px',
                    color: '#22c55e', fontSize: '12px', cursor: 'pointer', fontWeight: '500',
                  }}
                >✓ Mark all as read</button>
              </div>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '56px 140px 180px 160px 140px 100px 120px 80px',
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: '11px', color: '#8b949e', fontWeight: '600',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span></span>
              <span>Time</span>
              <span>Alert Type</span>
              <span>Camera / Zone</span>
              <span>Worker</span>
              <span>Severity</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {/* Rows */}
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                Loading alerts…
              </div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎉</div>
                <div style={{ fontWeight: '600', color: '#e6edf3', marginBottom: '4px' }}>No alerts found</div>
                <div style={{ fontSize: '13px' }}>Try changing the filters above</div>
              </div>
            ) : (
              alerts.map(alert => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  loading={actionLoading === alert.id}
                />
              ))
            )}

            {/* Pagination */}
            {total > LIMIT && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '12px', color: '#8b949e' }}>
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} alerts
                </span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <PageBtn label="‹" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} />
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
                    <PageBtn key={n} label={n} onClick={() => setPage(n)} active={page === n} />
                  ))}
                  <PageBtn label="›" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Summary panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Donut chart summary */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '18px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Alerts Summary</span>
              <span style={{ fontSize: '12px', color: '#8b949e' }}>Today</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <PieChart width={100} height={100}>
                  <Pie
                    data={[
                      { value: summary.no_helmet || 1 },
                      { value: summary.no_vest || 1 },
                      { value: summary.no_helmet_and_no_vest || 1 },
                    ]}
                    cx={45} cy={45}
                    innerRadius={28} outerRadius={44}
                    dataKey="value" paddingAngle={3}
                  >
                    <Cell fill="#f97316" />
                    <Cell fill="#eab308" />
                    <Cell fill="#a855f7" />
                  </Pie>
                </PieChart>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%,-50%)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#e6edf3' }}>{summary.total}</div>
                  <div style={{ fontSize: '9px', color: '#8b949e' }}>Total</div>
                </div>
              </div>

              <div style={{ flex: 1 }}>
                {[
                  { label: 'No Helmet', color: '#f97316', count: summary.no_helmet },
                  { label: 'No Vest',   color: '#eab308', count: summary.no_vest   },
                  { label: 'No Helmet & No Vest', color: '#a855f7', count: summary.no_helmet_and_no_vest },
                ].map(item => (
                  <div key={item.label} style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: '7px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', background: item.color, borderRadius: '50%' }} />
                      <span style={{ fontSize: '11px', color: '#8b949e' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3' }}>
                      {item.count} ({summary.total > 0 ? Math.round(item.count / summary.total * 100) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '18px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '14px' }}>
              Violation Trend (Today)
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={MOCK_TREND}>
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#8b949e' }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px' }}
                  labelStyle={{ color: '#e6edf3' }}
                />
                <Line type="monotone" dataKey="helmet" stroke="#f97316" dot={false} strokeWidth={2} name="No Helmet" />
                <Line type="monotone" dataKey="vest"   stroke="#eab308" dot={false} strokeWidth={2} name="No Vest"   />
                <Line type="monotone" dataKey="both"   stroke="#a855f7" dot={false} strokeWidth={2} name="Both"      />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
              {[['#f97316','No Helmet'],['#eab308','No Vest'],['#a855f7','No Helmet & No Vest']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#8b949e' }}>
                  <div style={{ width: '10px', height: '3px', background: c, borderRadius: '2px' }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Recent snapshots (visual placeholder) */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '18px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Recent Alert Snapshots</span>
              <span style={{ fontSize: '12px', color: '#3b82f6', cursor: 'pointer' }}>View All</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { type: 'No Helmet & No Vest', zone: 'Zone A', color: '#ef4444' },
                { type: 'No Helmet',           zone: 'Zone B', color: '#f97316' },
                { type: 'No Vest',             zone: 'Zone A', color: '#eab308' },
              ].map((s, i) => (
                <div key={i} style={{
                  aspectRatio: '4/3',
                  background: `${s.color}15`,
                  border: `1px solid ${s.color}30`,
                  borderRadius: '8px',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '4px',
                }}>
                  <div style={{ fontSize: '20px' }}>
                    {VIOLATION_META[Object.keys(VIOLATION_META).find(k => VIOLATION_META[k].label === s.type)]?.icon || '⚠️'}
                  </div>
                  <div style={{ fontSize: '9px', color: s.color, fontWeight: '600', textAlign: 'center', padding: '0 4px' }}>{s.type}</div>
                  <div style={{ fontSize: '9px', color: '#8b949e' }}>{s.zone}</div>
                </div>
              ))}
            </div>
            <button style={{
              width: '100%', marginTop: '12px', padding: '8px',
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: '7px', color: '#8b949e', fontSize: '12px', cursor: 'pointer',
            }}>
              📊 View Full Reports
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── AlertRow component ────────────────────────────────────────
function AlertRow({ alert, onStatusChange, onDelete, loading }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const meta = VIOLATION_META[alert.violation_type] || { icon: '⚠️', label: alert.violation_type, color: '#8b949e' }
  const time = new Date(alert.created_at)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '56px 140px 180px 160px 140px 100px 120px 80px',
      padding: '12px 20px',
      borderBottom: '1px solid var(--border)',
      alignItems: 'center',
      opacity: loading ? 0.5 : 1,
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div style={{
        width: '40px', height: '40px',
        background: `${meta.color}18`,
        border: `1px solid ${meta.color}30`,
        borderRadius: '7px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '18px',
      }}>{meta.icon}</div>

      {/* Time */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3' }}>
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e' }}>
          {time.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Alert type */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: meta.color }}>{meta.label}</div>
        <div style={{ fontSize: '11px', color: '#8b949e' }}>
          {alert.source === 'live_stream' ? '📡 Live' : '🎬 Video'}
        </div>
      </div>

      {/* Camera / Zone */}
      <div>
        <div style={{ fontSize: '12px', color: '#e6edf3' }}>{alert.camera}</div>
        <div style={{ fontSize: '11px', color: '#8b949e' }}>{alert.zone}</div>
      </div>

      {/* Worker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#8b949e' }}>
        <span>👤</span>
        <span>Worker ID: {alert.worker_id ?? '—'}</span>
      </div>

      {/* Severity */}
      <SeverityBadge severity={alert.severity} />

      {/* Status */}
      <StatusBadge status={alert.status} />

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
        {/* View (visual) */}
        <button
          title="View details"
          style={iconBtnStyle}
        >👁</button>

        {/* More actions dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={iconBtnStyle}
          >⋮</button>

          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 50,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px', overflow: 'hidden',
              minWidth: '150px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              {alert.status !== 'acknowledged' && (
                <DropItem
                  icon="◆" label="Acknowledge"
                  color="#3b82f6"
                  onClick={() => { onStatusChange(alert.id, 'acknowledged'); setMenuOpen(false) }}
                />
              )}
              {alert.status !== 'resolved' && (
                <DropItem
                  icon="✓" label="Resolve"
                  color="#22c55e"
                  onClick={() => { onStatusChange(alert.id, 'resolved'); setMenuOpen(false) }}
                />
              )}
              <DropItem
                icon="🗑" label="Delete"
                color="#ef4444"
                onClick={() => { onDelete(alert.id); setMenuOpen(false) }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DropItem({ icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        width: '100%', padding: '9px 14px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color, fontSize: '13px', textAlign: 'left',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {icon} {label}
    </button>
  )
}

function PageBtn({ label, onClick, active, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '30px', height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--accent-blue)' : 'var(--bg-primary)',
        border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`,
        borderRadius: '6px',
        color: active ? 'white' : disabled ? '#8b949e' : '#e6edf3',
        fontSize: '13px', cursor: disabled ? 'default' : 'pointer',
      }}
    >{label}</button>
  )
}

// ── Shared styles ─────────────────────────────────────────────
const selectStyle = {
  padding: '7px 10px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '7px',
  color: '#e6edf3',
  fontSize: '13px',
  cursor: 'pointer',
}

const iconBtnStyle = {
  width: '28px', height: '28px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  cursor: 'pointer', fontSize: '13px', color: '#8b949e',
}