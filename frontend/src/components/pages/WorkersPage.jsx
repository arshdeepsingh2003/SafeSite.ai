// ============================================================
// SafeSite AI — Workers Page  (Phase 10)
// File: frontend/src/components/pages/WorkersPage.jsx
// Matches design: worker table, stat cards, detail panel, filters
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

// ── Violation badge helper ────────────────────────────────────
function ComplianceBadge({ status }) {
  const map = {
    compliant:     { icon: '✅', label: 'Compliant',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
    no_helmet:     { icon: '⛑️',  label: 'No Helmet',     color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
    no_vest:       { icon: '🦺', label: 'No Vest',       color: '#eab308', bg: 'rgba(234,179,8,0.12)'   },
    non_compliant: { icon: '🚨', label: 'Non-Compliant', color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  }
  const s = map[status] || map.compliant
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '4px 10px', borderRadius: '20px',
      background: s.bg, fontSize: '12px', fontWeight: '600', color: s.color,
    }}>
      {s.icon} {s.label}
    </div>
  )
}

function StatusBadge({ active }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
      background: active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: active ? '#22c55e' : '#ef4444',
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: '16px',
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
        background: `${color}18`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '22px',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '22px', fontWeight: '700', color, lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Worker detail panel ───────────────────────────────────────
function WorkerDetailPanel({ worker, onClose }) {
  if (!worker) return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>👷</div>
      <div style={{ fontSize: '13px', color: '#8b949e' }}>
        Click on a worker row to see their details
      </div>
    </div>
  )

  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '20px' }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '22px',
        }}>👷</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#e6edf3', marginBottom: '2px' }}>
            {worker.name}
          </div>
          <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '6px' }}>
            {worker.worker_code} • {worker.phone}
          </div>
          <StatusBadge active={worker.is_active !== false} />
        </div>
      </div>

      {/* Details grid */}
      <div style={{ marginBottom: '16px' }}>
        {[
          { icon: '🔧', label: 'Role',        value: worker.role      || 'Laborer'  },
          { icon: '📍', label: 'Site / Zone', value: `${worker.site || 'Main Site'} / ${worker.zone || 'Zone A'}` },
          { icon: '📅', label: 'Join Date',   value: worker.join_date ? new Date(worker.join_date).toLocaleDateString() : '—' },
          { icon: '⏱',  label: 'Experience',  value: worker.experience || '—'       },
          { icon: '🌍', label: 'Nationality', value: worker.nationality || '—'      },
        ].map(row => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderBottom: '1px solid var(--border)',
            fontSize: '12px',
          }}>
            <span style={{ color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {row.icon} {row.label}
            </span>
            <span style={{ color: '#e6edf3', fontWeight: '500' }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Compliance summary */}
      <div style={{
        padding: '14px', background: 'var(--bg-primary)',
        borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '14px',
      }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3', marginBottom: '10px' }}>
          Compliance Summary (This Week)
        </div>
        {[
          { label: 'Compliant',     pct: worker.compliance_pct   || 71, color: '#22c55e' },
          { label: 'Partial',       pct: worker.partial_pct       || 14, color: '#eab308' },
          { label: 'Non-Compliant', pct: worker.noncompliant_pct  || 14, color: '#ef4444' },
        ].map(row => (
          <div key={row.label} style={{ marginBottom: '7px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontSize: '11px', color: '#8b949e' }}>{row.label}</span>
              <span style={{ fontSize: '11px', color: row.color, fontWeight: '600' }}>{row.pct}%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--bg-secondary)', borderRadius: '2px' }}>
              <div style={{ height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: '2px' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent detections */}
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3', marginBottom: '8px' }}>
        Recent Detections
      </div>
      {(worker.recent_detections || [
        { type: 'compliant',     time: 'Today, 10:28 AM', camera: 'Camera 1 • Zone A' },
        { type: 'no_helmet',     time: 'Today, 09:50 AM', camera: 'Camera 1 • Zone A' },
        { type: 'no_vest',       time: 'Yesterday, 4:30PM', camera: 'Camera 1 • Zone A' },
      ]).map((d, i) => {
        const colors = {
          compliant: '#22c55e', no_helmet: '#ef4444',
          no_vest: '#eab308', non_compliant: '#ef4444'
        }
        return (
          <div key={i} style={{
            display: 'flex', gap: '10px', padding: '8px 0',
            borderBottom: '1px solid var(--border)', alignItems: 'center',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
              background: `${colors[d.type] || '#8b949e'}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
            }}>
              {d.type === 'compliant' ? '✅' : '⚠️'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '12px', fontWeight: '600',
                color: colors[d.type] || '#8b949e',
                textTransform: 'capitalize', marginBottom: '2px',
              }}>
                {d.type?.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>{d.camera}</div>
            </div>
            <div style={{ fontSize: '10px', color: '#8b949e', flexShrink: 0 }}>{d.time}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Add Worker Modal ──────────────────────────────────────────
function AddWorkerModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: '', worker_code: '', phone: '', role: 'Laborer',
    site: 'Main Site', zone: 'Zone A', experience: '', nationality: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name || !form.worker_code) {
      toast.error('Name and Worker ID are required')
      return
    }
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px',
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: '7px', color: '#e6edf3', fontSize: '13px', outline: 'none',
  }
  const selectStyle = { ...inputStyle }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#e6edf3' }}>➕ Add New Worker</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {[
            { label: 'Full Name *', key: 'name',       placeholder: 'Ramesh Kumar' },
            { label: 'Worker ID *', key: 'worker_code', placeholder: 'WKR-1001'    },
            { label: 'Phone',       key: 'phone',       placeholder: '+91 98765 43210' },
            { label: 'Experience',  key: 'experience',  placeholder: '5 Years'      },
            { label: 'Nationality', key: 'nationality', placeholder: 'India'        },
          ].map(f => (
            <div key={f.key} style={{ gridColumn: f.key === 'name' ? 'span 2' : 'auto' }}>
              <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '5px' }}>{f.label}</label>
              <input
                value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder} style={inputStyle}
              />
            </div>
          ))}

          {[
            { label: 'Role',    key: 'role',  options: ['Laborer','Electrician','Plumber','Welder','Carpenter','Steel Fixer','Supervisor'] },
            { label: 'Site',    key: 'site',  options: ['Main Site','North Zone Site','East Side Project','West End Construction'] },
            { label: 'Zone',    key: 'zone',  options: ['Zone A','Zone B','Zone C','Zone D'] },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '5px' }}>{f.label}</label>
              <select value={form[f.key]} onChange={e => set(f.key, e.target.value)} style={selectStyle}>
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: '8px',
            color: '#8b949e', cursor: 'pointer', fontSize: '13px',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 2, padding: '10px',
            background: saving ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', borderRadius: '8px',
            color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
          }}>
            {saving ? '⏳ Saving…' : '✅ Add Worker'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function WorkersPage() {
  const [workers,       setWorkers]       = useState([])
  const [summary,       setSummary]       = useState({ total: 0, active: 0, non_compliant: 0, compliant_today: 0, new_this_week: 0 })
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState(null)
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [search,        setSearch]        = useState('')
  const [filterSite,    setFilterSite]    = useState('all')
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [page,          setPage]          = useState(1)
  const [total,         setTotal]         = useState(0)
  const LIMIT = 8

  const fetchWorkers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: LIMIT, skip: (page - 1) * LIMIT,
        ...(search       && { search }),
        ...(filterSite   !== 'all' && { site: filterSite }),
        ...(filterStatus !== 'all' && { status: filterStatus }),
      })
      const [wRes, sRes] = await Promise.all([
        api.get(`/workers?${params}`),
        api.get('/workers/summary'),
      ])
      setWorkers(wRes.data.workers || [])
      setTotal(wRes.data.total     || 0)
      setSummary(sRes.data)
    } catch { toast.error('Could not load workers') }
    finally  { setLoading(false) }
  }, [page, search, filterSite, filterStatus])

  useEffect(() => { fetchWorkers() }, [fetchWorkers])

  async function handleAddWorker(form) {
    try {
      await api.post('/workers', form)
      toast.success(`✅ Worker ${form.name} added!`)
      fetchWorkers()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add worker')
      throw err
    }
  }

  async function handleDeleteWorker(id, name) {
    if (!window.confirm(`Remove worker "${name}"?`)) return
    try {
      await api.delete(`/workers/${id}`)
      toast.success('Worker removed')
      if (selected?._id === id) setSelected(null)
      fetchWorkers()
    } catch { toast.error('Could not remove worker') }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // Compliance from recent alert — derive status
  function workerComplianceStatus(w) {
    if (!w.last_violation) return 'compliant'
    return w.last_violation === 'no_helmet' ? 'no_helmet'
         : w.last_violation === 'no_vest'   ? 'no_vest'
         : 'non_compliant'
  }

  const inputStyle = {
    padding: '8px 12px',
    background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: '7px', color: '#e6edf3', fontSize: '13px', outline: 'none',
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>Dashboard › Workers</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Workers</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '9px 18px', display: 'flex', alignItems: 'center', gap: '7px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '8px',
              color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer',
            }}
          >+ Add New Worker</button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '20px' }}>
        <StatCard icon="👥" label="Total Workers"    value={summary.total}           sub="All registered"         color="#3b82f6" />
        <StatCard icon="✅" label="Active Workers"   value={summary.active}          sub={`${summary.total ? Math.round(summary.active/summary.total*100) : 0}% of total`} color="#22c55e" />
        <StatCard icon="⛑️"  label="Non-Compliant"   value={summary.non_compliant}   sub={`${summary.total ? Math.round(summary.non_compliant/summary.total*100) : 0}% of total`} color="#ef4444" />
        <StatCard icon="🦺" label="Compliant Today"  value={summary.compliant_today} sub={`${summary.total ? Math.round(summary.compliant_today/summary.total*100) : 0}% of total`} color="#f97316" />
        <StatCard icon="🆕" label="New This Week"    value={summary.new_this_week}   sub="+ from last week"        color="#a855f7" />
      </div>

      {/* ── Main content: Table + Detail Panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>

        {/* ── Table ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {/* Filters */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
          }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
              <input
                value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search workers..."
                style={{ ...inputStyle, width: '100%', paddingLeft: '32px' }}
              />
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }}>🔍</span>
            </div>
            <select value={filterSite} onChange={e => { setFilterSite(e.target.value); setPage(1) }} style={inputStyle}>
              <option value="all">All Sites</option>
              {['Main Site','North Zone Site','East Side Project','West End Construction'].map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={inputStyle}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '100px 1fr 130px 100px 130px 120px 80px',
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            fontSize: '11px', color: '#8b949e', fontWeight: '600', textTransform: 'uppercase',
          }}>
            {['Worker ID','Worker Name','Site / Zone','Role','Compliance','Last Detected','Actions'].map(h => (
              <div key={h}>{h}</div>
            ))}
          </div>

          {/* Table rows */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
              ⏳ Loading workers…
            </div>
          ) : workers.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>👷</div>
              No workers found.{' '}
              <button onClick={() => setShowAddModal(true)} style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                Add the first worker
              </button>
            </div>
          ) : workers.map(w => {
            const isSelected = selected?._id === w._id
            const compStatus = workerComplianceStatus(w)
            return (
              <div
                key={w._id}
                onClick={() => setSelected(isSelected ? null : w)}
                style={{
                  display: 'grid', gridTemplateColumns: '100px 1fr 130px 100px 130px 120px 80px',
                  padding: '12px 16px', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', alignItems: 'center',
                  background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6366f1' }}>{w.worker_code}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                  }}>👷</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>{w.name}</div>
                    <div style={{ fontSize: '11px', color: '#8b949e' }}>{w.phone}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#e6edf3' }}>{w.site}</div>
                  <div style={{ fontSize: '11px', color: '#8b949e' }}>{w.zone}</div>
                </div>
                <div style={{ fontSize: '12px', color: '#8b949e' }}>{w.role}</div>
                <ComplianceBadge status={compStatus} />
                <div style={{ fontSize: '11px', color: '#8b949e' }}>
                  {w.last_detected ? new Date(w.last_detected).toLocaleString() : 'Never'}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); setSelected(w) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}
                    title="View details"
                  >👁</button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteWorker(w._id, w.name) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}
                    title="Remove worker"
                  >🗑</button>
                </div>
              </div>
            )
          })}

          {/* Pagination */}
          <div style={{
            padding: '14px 20px', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: '#8b949e' }}>
              Showing {workers.length ? (page-1)*LIMIT+1 : 0}–{Math.min(page*LIMIT, total)} of {total} workers
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                style={{ padding: '5px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '6px', color: '#8b949e', cursor: 'pointer', fontSize: '12px' }}>‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none', background: page === n ? '#6366f1' : 'var(--bg-primary)', color: page === n ? 'white' : '#8b949e' }}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                style={{ padding: '5px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '6px', color: '#8b949e', cursor: 'pointer', fontSize: '12px' }}>›</button>
            </div>
          </div>
        </div>

        {/* ── Detail Panel ── */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px' }}>
            Worker Details
          </div>
          <WorkerDetailPanel worker={selected} onClose={() => setSelected(null)} />
        </div>
      </div>

      {/* Add Worker Modal */}
      {showAddModal && (
        <AddWorkerModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddWorker}
        />
      )}
    </div>
  )
}