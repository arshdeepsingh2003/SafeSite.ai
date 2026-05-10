// ============================================================
// SafeSite AI — Sites Page  (Phase 10)
// File: frontend/src/components/pages/SitesPage.jsx
// ============================================================

import { useState, useEffect } from 'react'
import api   from '../../services/api'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'

// ── Helpers ───────────────────────────────────────────────────

const STATUS_STYLE = {
  active:      { bg:'rgba(34,197,94,0.15)',  color:'#22c55e', border:'rgba(34,197,94,0.3)'  },
  inactive:    { bg:'rgba(139,148,158,0.15)',color:'#8b949e', border:'rgba(139,148,158,0.3)'},
  maintenance: { bg:'rgba(234,179,8,0.15)',  color:'#eab308', border:'rgba(234,179,8,0.3)'  },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.inactive
  return (
    <span style={{
      padding:'3px 10px', borderRadius:'12px', fontSize:'11px', fontWeight:'600',
      background:s.bg, color:s.color, border:`1px solid ${s.border}`, textTransform:'capitalize',
    }}>{status}</span>
  )
}

function ComplianceDial({ rate }) {
  if (rate === 0 || rate == null) return (
    <span style={{ fontSize:'13px', color:'#8b949e' }}>—</span>
  )
  const color = rate >= 75 ? '#22c55e' : rate >= 60 ? '#eab308' : '#ef4444'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
      <div style={{ position:'relative', width:'36px', height:'36px' }}>
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2937" strokeWidth="4"/>
          <circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${rate * 0.88} 88`} strokeLinecap="round"
            transform="rotate(-90 18 18)"/>
        </svg>
      </div>
      <span style={{ fontSize:'12px', fontWeight:'700', color }}>{rate}%</span>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{
      background:'var(--bg-secondary)', border:'1px solid var(--border)',
      borderRadius:'12px', padding:'16px 20px',
      display:'flex', alignItems:'center', gap:'14px', flex:1,
    }}>
      <div style={{
        width:'48px', height:'48px', borderRadius:'10px',
        background:'var(--bg-card)',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px',
        flexShrink:0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize:'11px', color:'#8b949e', marginBottom:'2px' }}>{label}</div>
        <div style={{ fontSize:'24px', fontWeight:'700', color: color || '#e6edf3' }}>{value}</div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function SitesPage() {
  const { isAdmin } = useAuth()
  const [sites,    setSites]    = useState([])
  const [summary,  setSummary]  = useState({})
  const [selected, setSelected] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddModal, setShowAddModal] = useState(false)

  // New site form state
  const [newSite, setNewSite] = useState({
    name:'', location:'', project_manager:'', status:'active', description:''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [sitesRes, summaryRes] = await Promise.all([
        api.get('/sites'),
        api.get('/sites/summary'),
      ])
      setSites(sitesRes.data.sites || [])
      setSummary(summaryRes.data || {})
      if (sitesRes.data.sites?.length > 0 && !selected) {
        setSelected(sitesRes.data.sites[0])
      }
    } catch (err) {
      console.error('Failed to load sites:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddSite() {
    if (!newSite.name || !newSite.location) {
      toast.error('Site name and location are required')
      return
    }
    setSaving(true)
    try {
      await api.post('/sites', newSite)
      toast.success(`✅ "${newSite.name}" created!`)
      setShowAddModal(false)
      setNewSite({ name:'', location:'', project_manager:'', status:'active', description:'' })
      await loadData()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create site')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSite(siteId, siteName) {
    if (!window.confirm(`Delete "${siteName}"? This cannot be undone.`)) return
    try {
      await api.delete(`/sites/${siteId}`)
      toast.success('Site deleted')
      setSelected(null)
      await loadData()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete site')
    }
  }

  const filtered = sites.filter(s => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    const matchSearch = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.location?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div>
      {/* Page header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' }}>
        <div>
          <div style={{ fontSize:'12px', color:'#8b949e', marginBottom:'4px' }}>Dashboard › Sites</div>
          <h1 style={{ fontSize:'22px', fontWeight:'700', color:'#e6edf3' }}>Sites</h1>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAddModal(true)} style={{
            display:'flex', alignItems:'center', gap:'6px', padding:'10px 18px',
            background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
            border:'none', borderRadius:'8px', color:'white',
            fontSize:'13px', fontWeight:'700', cursor:'pointer',
          }}>+ Add New Site</button>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'20px', flexWrap:'wrap' }}>
        <StatCard icon="🏗️" label="Total Sites"   value={summary.total_sites  ?? '—'} />
        <StatCard icon="✅" label="Active Sites"  value={summary.active_sites ?? '—'} color="#22c55e" />
        <StatCard icon="📹" label="Total Cameras" value={summary.total_cameras ?? 30} />
        <StatCard icon="🗺️" label="Total Zones"   value={summary.total_zones  ?? 18} />
        <StatCard icon="⚠️" label="High Risk"     value={summary.high_risk    ?? '—'} color="#ef4444" />
      </div>

      {/* Main 2-column layout */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'16px', alignItems:'start' }}>

        {/* ── Sites table ── */}
        <div style={{
          background:'var(--bg-secondary)', border:'1px solid var(--border)',
          borderRadius:'12px', overflow:'hidden',
        }}>
          {/* Filters */}
          <div style={{
            display:'flex', gap:'10px', padding:'14px 16px',
            borderBottom:'1px solid var(--border)', flexWrap:'wrap',
          }}>
            <div style={{ position:'relative', flex:1 }}>
              <span style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#8b949e', fontSize:'14px' }}>🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search sites…"
                style={{
                  width:'100%', padding:'8px 10px 8px 32px',
                  background:'var(--bg-primary)', border:'1px solid var(--border)',
                  borderRadius:'7px', color:'#e6edf3', fontSize:'13px', outline:'none',
                }} />
            </div>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
              style={{ padding:'8px 12px', background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:'7px', color:'#e6edf3', fontSize:'13px' }}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          {/* Table header */}
          <div style={{
            display:'grid', gridTemplateColumns:'2fr 80px 60px 100px 90px 110px 80px',
            padding:'10px 16px', borderBottom:'1px solid var(--border)',
            fontSize:'11px', fontWeight:'600', color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.05em',
          }}>
            <span>Site Name</span><span>Cameras</span><span>Zones</span>
            <span>Status</span><span>Compliance</span><span>Last Activity</span><span>Actions</span>
          </div>

          {loading ? (
            <div style={{ padding:'40px', textAlign:'center', color:'#8b949e' }}>Loading sites…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:'40px', textAlign:'center', color:'#8b949e' }}>
              <div style={{ fontSize:'32px', marginBottom:'8px' }}>🏗️</div>
              No sites found. {isAdmin && 'Click "Add New Site" to create one.'}
            </div>
          ) : (
            filtered.map(site => (
              <div
                key={site.id}
                onClick={() => setSelected(site)}
                style={{
                  display:'grid', gridTemplateColumns:'2fr 80px 60px 100px 90px 110px 80px',
                  padding:'12px 16px', borderBottom:'1px solid var(--border)',
                  cursor:'pointer', transition:'background 0.15s',
                  background: selected?.id === site.id ? 'rgba(59,130,246,0.08)' : 'transparent',
                }}
                onMouseEnter={e=>{ if(selected?.id!==site.id) e.currentTarget.style.background='var(--bg-hover)' }}
                onMouseLeave={e=>{ if(selected?.id!==site.id) e.currentTarget.style.background='transparent' }}
              >
                {/* Name + location */}
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{
                    width:'40px', height:'40px', borderRadius:'8px', flexShrink:0,
                    background:'var(--bg-primary)', border:'1px solid var(--border)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px',
                  }}>🏗️</div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ fontSize:'13px', fontWeight:'600', color:'#e6edf3' }}>{site.name}</span>
                      {site.is_primary && (
                        <span style={{
                          padding:'1px 7px', background:'rgba(99,102,241,0.2)',
                          border:'1px solid rgba(99,102,241,0.4)',
                          borderRadius:'10px', fontSize:'10px', color:'#818cf8', fontWeight:'700',
                        }}>Primary</span>
                      )}
                    </div>
                    <div style={{ fontSize:'11px', color:'#8b949e' }}>{site.location}</div>
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', fontSize:'13px', color:'#e6edf3' }}>
                  {site.cameras ?? '—'}
                </div>
                <div style={{ display:'flex', alignItems:'center', fontSize:'13px', color:'#e6edf3' }}>
                  {site.zones?.length ?? '—'}
                </div>
                <div style={{ display:'flex', alignItems:'center' }}>
                  <StatusBadge status={site.status} />
                </div>
                <div style={{ display:'flex', alignItems:'center' }}>
                  <ComplianceDial rate={site.compliance_rate} />
                </div>
                <div style={{ display:'flex', alignItems:'center', fontSize:'11px', color:'#8b949e' }}>
                  <span style={{
                    width:'6px', height:'6px', borderRadius:'50%', flexShrink:0,
                    background: site.status === 'active' ? '#22c55e' : '#8b949e',
                    marginRight:'5px', animation: site.status==='active'?'pulse 2s infinite':'none',
                  }}/>
                  {site.status === 'active' ? '2 min ago' : site.status === 'maintenance' ? '1 hour ago' : '2 days ago'}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <a href="/live-monitoring" onClick={e=>e.stopPropagation()}
                    title="View live" style={{ fontSize:'16px', color:'#8b949e', textDecoration:'none' }}>👁</a>
                  {isAdmin && (
                    <button
                      onClick={e=>{ e.stopPropagation(); handleDeleteSite(site.id, site.name) }}
                      title="Delete site"
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#8b949e', padding:'2px' }}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Pagination */}
          <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'12px', color:'#8b949e' }}>
              Showing 1 to {filtered.length} of {filtered.length} sites
            </span>
            <div style={{ display:'flex', gap:'4px' }}>
              <PageBtn label="‹" />
              <PageBtn label="1" active />
              <PageBtn label="›" />
            </div>
          </div>
        </div>

        {/* ── Site Detail Panel ── */}
        <div style={{
          background:'var(--bg-secondary)', border:'1px solid var(--border)',
          borderRadius:'12px', overflow:'hidden',
        }}>
          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'14px 16px', borderBottom:'1px solid var(--border)',
          }}>
            <span style={{ fontSize:'14px', fontWeight:'600', color:'#e6edf3' }}>Site Details</span>
            {selected && isAdmin && (
              <button style={{
                padding:'5px 12px', background:'rgba(99,102,241,0.1)',
                border:'1px solid rgba(99,102,241,0.3)', borderRadius:'6px',
                color:'#818cf8', fontSize:'12px', cursor:'pointer',
              }}>✏️ Edit Site</button>
            )}
          </div>

          {!selected ? (
            <div style={{ padding:'40px 20px', textAlign:'center', color:'#8b949e', fontSize:'13px' }}>
              Click a site in the table to view details
            </div>
          ) : (
            <div>
              {/* Site image placeholder */}
              <div style={{
                height:'140px', background:'linear-gradient(135deg,#1f2937,#0d1117)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:'48px',
              }}>🏗️</div>

              {/* Site info */}
              <div style={{ padding:'16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ fontSize:'15px', fontWeight:'700', color:'#e6edf3' }}>{selected.name}</span>
                  <StatusBadge status={selected.status} />
                </div>
                <div style={{ fontSize:'12px', color:'#8b949e', marginBottom:'12px' }}>
                  📍 {selected.location}
                </div>

                {[
                  { label:'Site ID',         value:`SITE-00${sites.indexOf(selected)+1}` },
                  { label:'Project Manager', value:selected.project_manager || '—' },
                  { label:'Start Date',      value:selected.start_date || '—' },
                  { label:'End Date',        value:selected.end_date || '—' },
                ].map(row => (
                  <div key={row.label} style={{
                    display:'flex', justifyContent:'space-between',
                    padding:'6px 0', borderBottom:'1px solid var(--border)',
                    fontSize:'12px',
                  }}>
                    <span style={{ color:'#8b949e' }}>{row.label}</span>
                    <span style={{ color:'#e6edf3', fontWeight:'600' }}>{row.value}</span>
                  </div>
                ))}

                {selected.description && (
                  <div style={{ marginTop:'10px', marginBottom:'14px' }}>
                    <div style={{ fontSize:'11px', fontWeight:'600', color:'#8b949e', marginBottom:'4px' }}>Description:</div>
                    <div style={{ fontSize:'12px', color:'#e6edf3', lineHeight:1.5 }}>{selected.description}</div>
                  </div>
                )}

                {/* Quick stats */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', margin:'14px 0' }}>
                  {[
                    { label:'Cameras', value:selected.cameras ?? '—' },
                    { label:'Zones',   value:selected.zones?.length ?? '—' },
                    { label:'Workers', value:selected.workers ?? '—' },
                  ].map(s => (
                    <div key={s.label} style={{
                      textAlign:'center', padding:'10px 6px',
                      background:'var(--bg-primary)', borderRadius:'8px',
                      border:'1px solid var(--border)',
                    }}>
                      <div style={{ fontSize:'18px', fontWeight:'700', color:'#e6edf3' }}>{s.value}</div>
                      <div style={{ fontSize:'10px', color:'#8b949e' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'14px' }}>
                  <div style={{ textAlign:'center', padding:'10px 6px', background:'var(--bg-primary)', borderRadius:'8px', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:'16px', fontWeight:'700', color:'#22c55e' }}>{selected.compliance_rate ?? 0}%</div>
                    <div style={{ fontSize:'10px', color:'#8b949e' }}>Compliance</div>
                  </div>
                  <div style={{ textAlign:'center', padding:'10px 6px', background:'var(--bg-primary)', borderRadius:'8px', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:'16px', fontWeight:'700', color:'#eab308' }}>{selected.active_alerts ?? 0}</div>
                    <div style={{ fontSize:'10px', color:'#8b949e' }}>Active Alerts</div>
                  </div>
                  <div style={{ textAlign:'center', padding:'10px 6px', background:'var(--bg-primary)', borderRadius:'8px', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:'16px', fontWeight:'700', color:'#ef4444' }}>
                      {selected.compliance_rate < 60 ? '2' : '0'}
                    </div>
                    <div style={{ fontSize:'10px', color:'#8b949e' }}>High Risk</div>
                  </div>
                </div>

                <a href="/analytics" style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
                  width:'100%', padding:'10px',
                  background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)',
                  borderRadius:'8px', color:'#818cf8', fontSize:'13px',
                  fontWeight:'600', textDecoration:'none', marginBottom:'14px',
                }}>📊 View Site Analytics</a>

                {/* Recent alerts */}
                {selected.recent_alerts?.length > 0 && (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                      <span style={{ fontSize:'12px', fontWeight:'600', color:'#e6edf3' }}>Recent Alerts</span>
                      <a href="/alerts" style={{ fontSize:'11px', color:'#3b82f6', textDecoration:'none' }}>View All</a>
                    </div>
                    {selected.recent_alerts.slice(0,3).map((a, i) => {
                      const col = a.severity==='high' ? '#ef4444' : '#eab308'
                      return (
                        <div key={i} style={{
                          display:'flex', gap:'8px', marginBottom:'8px',
                          fontSize:'12px', alignItems:'flex-start',
                        }}>
                          <span style={{ color:col, flexShrink:0 }}>⚠️</span>
                          <div>
                            <div style={{ fontWeight:'600', color:col }}>
                              {a.violation_type?.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                            </div>
                            <div style={{ color:'#8b949e' }}>{a.camera} • {a.zone}</div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Site Modal ── */}
      {showAddModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
        }} onClick={e=>{ if(e.target===e.currentTarget) setShowAddModal(false) }}>
          <div style={{
            background:'var(--bg-secondary)', border:'1px solid var(--border)',
            borderRadius:'14px', padding:'24px', width:'440px', maxWidth:'90vw',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px' }}>
              <h3 style={{ fontSize:'16px', fontWeight:'700', color:'#e6edf3' }}>Add New Site</h3>
              <button onClick={()=>setShowAddModal(false)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'#8b949e', fontSize:'18px' }}>✕</button>
            </div>
            {[
              { label:'Site Name*', key:'name', placeholder:'e.g. North Zone Site' },
              { label:'Location*',  key:'location', placeholder:'e.g. Brooklyn, New York, USA' },
              { label:'Project Manager', key:'project_manager', placeholder:'e.g. John Smith' },
              { label:'Description', key:'description', placeholder:'Brief project description…' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom:'14px' }}>
                <label style={{ fontSize:'12px', fontWeight:'600', color:'#e6edf3', display:'block', marginBottom:'5px' }}>
                  {f.label}
                </label>
                <input value={newSite[f.key]} onChange={e=>setNewSite({...newSite,[f.key]:e.target.value})}
                  placeholder={f.placeholder}
                  style={{
                    width:'100%', padding:'9px 12px',
                    background:'var(--bg-primary)', border:'1px solid var(--border)',
                    borderRadius:'7px', color:'#e6edf3', fontSize:'13px', outline:'none',
                  }} />
              </div>
            ))}
            <div style={{ marginBottom:'20px' }}>
              <label style={{ fontSize:'12px', fontWeight:'600', color:'#e6edf3', display:'block', marginBottom:'5px' }}>
                Status
              </label>
              <select value={newSite.status} onChange={e=>setNewSite({...newSite,status:e.target.value})}
                style={{ width:'100%', padding:'9px 12px', background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:'7px', color:'#e6edf3', fontSize:'13px' }}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={()=>setShowAddModal(false)}
                style={{ flex:1, padding:'10px', background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:'8px', color:'#8b949e', cursor:'pointer', fontSize:'13px' }}>
                Cancel
              </button>
              <button onClick={handleAddSite} disabled={saving}
                style={{ flex:1, padding:'10px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none', borderRadius:'8px', color:'white', fontWeight:'700', cursor:saving?'not-allowed':'pointer', fontSize:'13px', opacity:saving?0.7:1 }}>
                {saving ? '⏳ Creating…' : '✅ Create Site'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}

function PageBtn({ label, active }) {
  return (
    <button style={{
      width:'30px', height:'30px',
      background: active ? 'var(--accent-blue)' : 'var(--bg-primary)',
      border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border)'}`,
      borderRadius:'6px', color: active ? 'white' : '#8b949e',
      fontSize:'12px', cursor:'pointer', fontWeight: active ? '700' : '400',
    }}>{label}</button>
  )
}