// ============================================================
// SafeSite AI — Unified Dashboard Page (Dashboard + Analytics)
// File: frontend/src/components/pages/DashboardPage.jsx
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'
import { useAuth }          from '../../context/AuthContext'
import { useSocket }        from '../../context/SocketContext'
import { useSoundSettings } from '../../context/SoundContext'
import { playAlarm, playBeep } from '../../services/soundService'
import { useLLM }           from '../../hooks/useLLM'
import LiveAIInsight        from '../ui/LiveAIInsight'
import api   from '../../services/api'
import toast from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────
const ZONE_COLORS = ['#ef4444','#f97316','#22c55e','#3b82f6','#a855f7']
const inputStyle = {
  padding:'8px 12px', background:'var(--bg-primary)',
  border:'1px solid var(--border)', borderRadius:'7px',
  color:'#e6edf3', fontSize:'13px', outline:'none',
}

// ── Reusable: StatCard ────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, change, subColor }) {
  const up = change > 0
  return (
    <div className="dashboard-stat-card" style={{
      background:'var(--bg-secondary)', border:'1px solid var(--border)',
      borderRadius:'12px', padding:'16px 18px',
      display:'flex', alignItems:'center', gap:'14px', flex:1, minWidth:0,
      transition:'border-color 0.2s, transform 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color+'60'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{
        width:'44px', height:'44px', borderRadius:'10px', flexShrink:0,
        background:`${color}18`,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px',
      }}>{icon}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'11px', color:'#8b949e', marginBottom:'2px' }}>{label}</div>
        <div style={{ fontSize:'22px', fontWeight:'700', color, lineHeight:1.1 }}>{value}</div>
        <div style={{ fontSize:'11px', marginTop:'3px', display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
          {change !== undefined && (
            <span style={{ color: up ? '#22c55e' : '#ef4444', fontWeight:'600' }}>
              {up ? '\u2191' : '\u2193'} {Math.abs(change)}%
            </span>
          )}
          {sub && <span style={{ color: subColor || '#8b949e' }}>{sub}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Reusable: SectionCard ─────────────────────────────────────
function SectionCard({ title, topRight, children, style = {} }) {
  return (
    <div className="dashboard-section-card" style={{
      background:'var(--bg-secondary)', border:'1px solid var(--border)',
      borderRadius:'12px', padding:'18px', ...style,
      transition:'border-color 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#30363d80' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {(title || topRight) && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          {title && <div style={{ fontSize:'14px', fontWeight:'600', color:'#e6edf3' }}>{title}</div>}
          {topRight}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Reusable: RangeBtn ────────────────────────────────────────
function RangeBtn({ active, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'4px 10px', fontSize:'11px', fontWeight:'600', border:'none', cursor:'pointer',
      borderRadius:'6px',
      background: active ? 'var(--accent-blue)' : 'var(--bg-primary)',
      color:      active ? 'white' : '#8b949e',
      transition:'all 0.2s',
    }}>{label}</button>
  )
}

// ── Reusable: AlertRow ────────────────────────────────────────
function AlertRow({ alert }) {
  const severityColor = alert.severity === 'high' ? '#ef4444' : '#eab308'
  const icons = { no_helmet: '\u26D1\uFE0F', no_vest: '\u1F9BA', no_helmet_and_no_vest: '\uD83D\uDEA8' }
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:'10px',
      padding:'10px 0', borderBottom:'1px solid var(--border)',
      transition:'background 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        width:'32px', height:'32px', flexShrink:0,
        background:`${severityColor}18`, borderRadius:'8px',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px',
      }}>{icons[alert.violation_type] || '\u26A0\uFE0F'}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'#e6edf3', marginBottom:'2px' }}>
          {alert.violation_type?.replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())}
        </div>
        <div style={{ fontSize:'11px', color:'#8b949e' }}>
          {alert.zone} {'\u2022'} {alert.camera}
        </div>
      </div>
      <div style={{ fontSize:'11px', color:'#8b949e', flexShrink:0 }}>
        {alert.created_at
          ? new Date(alert.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
          : ''}
      </div>
    </div>
  )
}

// ── Reusable: Heatmap ─────────────────────────────────────────
function Heatmap({ data, days, buckets, maxCount }) {
  if (!data || data.length === 0) return (
    <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'13px' }}>
      No heatmap data for selected range
    </div>
  )

  const cell = (day, bucket) => {
    const d = data.find(r => r.day === day && r.bucket === bucket)
    const count = d?.count || 0
    const intensity = maxCount > 0 ? count / maxCount : 0
    const bg = count === 0
      ? 'rgba(99,102,241,0.04)'
      : `rgba(239,68,68,${Math.max(0.08, intensity * 0.85)})`
    return (
      <div key={`${day}-${bucket}`}
        title={`${day} ${bucket}: ${count} violations`}
        style={{
          background:bg, borderRadius:'4px',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'10px', color: intensity > 0.5 ? 'white' : '#8b949e',
          fontWeight:'600', cursor:'default', minHeight:'28px',
        }}
      >
        {count > 0 ? count : ''}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:`80px repeat(${days.length}, 1fr)`, gap:'4px', marginBottom:'4px' }}>
        <div />
        {days.map(d => (
          <div key={d} style={{ fontSize:'10px', color:'#8b949e', textAlign:'center', fontWeight:'600' }}>{d}</div>
        ))}
      </div>
      {buckets.map(bucket => (
        <div key={bucket} style={{ display:'grid', gridTemplateColumns:`80px repeat(${days.length}, 1fr)`, gap:'4px', marginBottom:'4px' }}>
          <div style={{ fontSize:'10px', color:'#8b949e', display:'flex', alignItems:'center', paddingRight:'8px' }}>{bucket}</div>
          {days.map(day => cell(day, bucket))}
        </div>
      ))}
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'10px', justifyContent:'flex-end' }}>
        <span style={{ fontSize:'10px', color:'#8b949e' }}>Low</span>
        {[0.1,0.3,0.5,0.7,0.9].map(i => (
          <div key={i} style={{ width:'18px', height:'12px', borderRadius:'2px', background:`rgba(239,68,68,${i})` }} />
        ))}
        <span style={{ fontSize:'10px', color:'#8b949e' }}>High</span>
      </div>
    </div>
  )
}

// ── Reusable: ZoneSummaryTable ────────────────────────────────
function ZoneSummaryTable({ rows, loading }) {
  if (loading) return (
    <div style={{ textAlign:'center', padding:'30px', color:'#8b949e' }}>Loading\u2026</div>
  )
  if (!rows || rows.length === 0) return (
    <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'13px' }}>
      <div style={{ fontSize:'32px', marginBottom:'8px' }}>\uD83D\uDCCA</div>
      No zone data yet. Run <code style={{ color:'#6366f1' }}>python seed_alerts.py</code> to generate sample data.
    </div>
  )
  return (
    <div style={{ overflowX:'auto' }}>
      <div style={{
        display:'grid', gridTemplateColumns:'100px 100px 90px 90px 80px 130px 110px',
        padding:'8px 10px', borderBottom:'1px solid var(--border)',
        fontSize:'10px', color:'#8b949e', fontWeight:'700', textTransform:'uppercase',
      }}>
        {['Zone','Workers','Compliant','No Helmet','No Vest','No Hlmt+Vest','Compliance'].map(h => (
          <div key={h}>{h}</div>
        ))}
      </div>
      {rows.map(row => (
        <div key={row.zone} style={{
          display:'grid', gridTemplateColumns:'100px 100px 90px 90px 80px 130px 110px',
          padding:'10px 10px', borderBottom:'1px solid var(--border)',
          fontSize:'12px', alignItems:'center', transition:'background 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <div style={{ fontWeight:'600', color:'#e6edf3' }}>{row.zone}</div>
          <div style={{ color:'#8b949e' }}>{row.total_workers.toLocaleString()}</div>
          <div style={{ color:'#22c55e' }}>
            {row.compliant.toLocaleString()}
            <span style={{ color:'#8b949e', fontSize:'10px' }}> ({Math.round(row.compliant/row.total_workers*100)}%)</span>
          </div>
          <div style={{ color:'#f97316' }}>
            {row.no_helmet}
            <span style={{ color:'#8b949e', fontSize:'10px' }}> ({Math.round(row.no_helmet/row.total_workers*100)}%)</span>
          </div>
          <div style={{ color:'#eab308' }}>
            {row.no_vest}
            <span style={{ color:'#8b949e', fontSize:'10px' }}> ({Math.round(row.no_vest/row.total_workers*100)}%)</span>
          </div>
          <div style={{ color:'#a855f7' }}>
            {row.no_helmet_and_no_vest}
            <span style={{ color:'#8b949e', fontSize:'10px' }}> ({Math.round(row.no_helmet_and_no_vest/row.total_workers*100)}%)</span>
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
              <div style={{ flex:1, height:'5px', background:'var(--bg-primary)', borderRadius:'3px', overflow:'hidden' }}>
                <div style={{
                  height:'100%', width:`${row.compliance_rate}%`,
                  background: row.compliance_rate >= 70 ? '#22c55e' : row.compliance_rate >= 50 ? '#eab308' : '#ef4444',
                  borderRadius:'3px', transition:'width 0.5s',
                }} />
              </div>
              <span style={{
                fontSize:'11px', fontWeight:'700',
                color: row.compliance_rate >= 70 ? '#22c55e' : row.compliance_rate >= 50 ? '#eab308' : '#ef4444',
                flexShrink:0,
              }}>{row.compliance_rate}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Reusable: DetectionSummaryCard ────────────────────────────
function DetectionSummaryCard({ data, loading }) {
  const items = [
    { icon:'\uD83C\uDFAC', label:'Total Videos Analyzed', value: data?.videos_analyzed ?? '\u2014' },
    { icon:'\u23F1',  label:'Total Duration',         value: data ? `${data.total_duration_hours}h` : '\u2014' },
    { icon:'\uD83D\uDCC8', label:'Avg. Detection Conf.',  value: data ? `${data.avg_confidence}%` : '\u2014' },
    { icon:'\uD83C\uDFAF', label:'Total Detections',      value: data?.total_detections?.toLocaleString() ?? '\u2014' },
    { icon:'\uD83D\uDEA8', label:'Total Alerts Created',  value: data?.total_alerts?.toLocaleString() ?? '\u2014' },
  ]
  return (
    <div>
      {items.map(item => (
        <div key={item.label} style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'10px 0', borderBottom:'1px solid var(--border)',
          fontSize:'12px',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'#8b949e' }}>
            <span>{item.icon}</span> {item.label}
          </div>
          <span style={{ fontWeight:'700', color:'#e6edf3' }}>{loading ? '\u2026' : item.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function DashboardPage() {
  const { user }       = useAuth()
  const { lastAlert } = useSocket()
  const { soundEnabled } = useSoundSettings()
  const { analyzeDetections, isConfigured: groqConfigured } = useLLM()

  // ── Dashboard stats (live polling) ───────────────────────
  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(true)

  // ── Analytics state ──────────────────────────────────────
  const [range,         setRange]         = useState('week')
  const [zone,          setZone]          = useState('all')
  const [trendGran,     setTrendGran]     = useState('daily')
  const trendGranRef = useRef('daily')
  const [summary,       setSummary]       = useState(null)
  const [trend,         setTrend]         = useState([])
  const [byZone,        setByZone]        = useState({ zones:[], grand_total:0 })
  const [heatmap,       setHeatmap]       = useState({ heatmap:[], days:[], buckets:[], max_count:1 })
  const [compTrend,     setCompTrend]     = useState([])
  const [zoneSummary,   setZoneSummary]   = useState([])
  const [detectionSum,  setDetectionSum]  = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  // ── LLM Insights ──
  const [insight,     setInsight]     = useState(null)
  const [insightLoad, setInsightLoad] = useState(false)

  // ── Dashboard poll every 30s ─────────────────────────────
  useEffect(() => {
    let timer
    async function load() {
      try {
        const res = await api.get('/dashboard/stats')
        setStats(res.data)
      } catch { /* silently ignore */ }
      finally { setLoading(false) }
    }
    load()
    timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [])

  // ── Play sound on real-time alert ────────────────────────
  useEffect(() => {
    if (!lastAlert || !soundEnabled) return
    if (lastAlert.severity === 'high') playAlarm()
    else playBeep()
  }, [lastAlert, soundEnabled])

  // ── Fetch all analytics data ─────────────────────────────
  const fetchAll = useCallback(async () => {
    setAnalyticsLoading(true)

    const results = await Promise.allSettled([
      api.get(`/analytics/summary?range=${range}&zone=${zone}`),
      api.get(`/analytics/trend?range=${range}&granularity=${trendGranRef.current}&zone=${zone}`),
      api.get(`/analytics/by-zone?range=${range}&zone=${zone}`),
      api.get(`/analytics/by-time-of-day?range=${range}&zone=${zone}`),
      api.get(`/analytics/compliance-trend?range=${range}&zone=${zone}`),
      api.get(`/analytics/zone-summary?range=${range}&zone=${zone}`),
      api.get(`/analytics/detection-summary?range=${range}&zone=${zone}`),
    ])

    const [sRes, tRes, zRes, hRes, cRes, zsRes, dRes] = results

    const errors = results.filter(r => r.status === 'rejected')
    if (errors.length > 0) {
      console.error('Analytics fetch errors:', errors.map(e => e.reason))
      if (errors.length === results.length) {
        toast.error('Could not load analytics data')
      }
    }

    if (sRes.status === 'fulfilled') setSummary(sRes.value.data)
    if (tRes.status === 'fulfilled') setTrend(tRes.value.data.data || [])
    if (zRes.status === 'fulfilled') setByZone(zRes.value.data)
    if (hRes.status === 'fulfilled') setHeatmap(hRes.value.data)
    if (cRes.status === 'fulfilled') setCompTrend(cRes.value.data.weeks || [])
    if (zsRes.status === 'fulfilled') setZoneSummary(zsRes.value.data.rows || [])
    if (dRes.status === 'fulfilled') setDetectionSum(dRes.value.data)

    setAnalyticsLoading(false)
  }, [range, zone])

  // Initial fetch on mount only — Apply Filters button & granularity toggles trigger manually
  useEffect(() => { fetchAll() }, [])

  // ── Generate AI insight when summary loads ───────────────
  useEffect(() => {
    if (!summary || !groqConfigured) return
    async function loadInsight() {
      setInsightLoad(true)
      try {
        const result = await analyzeDetections({
          zone:                  byZone.zones[0]?.zone || 'Zone A',
          total_workers:         summary.total_workers,
          compliant:             summary.compliant,
          no_helmet:             summary.no_helmet,
          no_vest:               summary.no_vest,
          no_helmet_and_no_vest: summary.no_helmet_and_no_vest,
          compliance_rate:       summary.compliance_rate,
          frames_analyzed:       summary.total_violations * 5,
        })
        setInsight(result)
      } catch { /* silently ignore */ }
      finally { setInsightLoad(false) }
    }
    loadInsight()
  }, [summary?.total_violations, groqConfigured])

  // ── Export report ────────────────────────────────────────
  function handleExport() {
    if (!summary) return
    const lines = [
      `SafeSite AI \u2014 Analytics Report`,
      `Period: ${range} | Zone: ${zone}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `Total Workers Detected: ${summary.total_workers}`,
      `Compliant:              ${summary.compliant}`,
      `No Helmet:              ${summary.no_helmet}`,
      `No Vest:                ${summary.no_vest}`,
      `Both Missing:           ${summary.no_helmet_and_no_vest}`,
      `Compliance Rate:        ${summary.compliance_rate}%`,
      '',
      'Zone Summary:',
      ...zoneSummary.map(r =>
        `  ${r.zone}: ${r.total_workers} workers, ${r.compliance_rate}% compliant`
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `analytics_${range}.txt`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Report exported!')
  }

  // ── Derived values (merge both data sources) ─────────────
  const sDash      = stats?.stats
  const total      = summary?.total_workers ?? sDash?.total_workers ?? 0
  const compliant  = summary?.compliant ?? sDash?.compliant ?? 0
  const noHelmet   = summary?.no_helmet ?? sDash?.no_helmet ?? 0
  const noVest     = summary?.no_vest ?? sDash?.no_vest ?? 0
  const bothMiss   = summary?.no_helmet_and_no_vest ?? sDash?.no_helmet_and_no_vest ?? 0
  const compRate   = summary?.compliance_rate ?? (total > 0 ? Math.round((compliant / total) * 100) : 0)

  const donutData  = [
    { name: 'Compliant',  value: compliant, color: '#22c55e' },
    { name: 'No Helmet',  value: noHelmet,  color: '#f97316' },
    { name: 'No Vest',    value: noVest,    color: '#eab308' },
    { name: 'Both',       value: bothMiss,  color: '#a855f7' },
  ].filter(d => d.value > 0)

  const topZones      = stats?.top_zones ?? []
  const trendData     = stats?.trend_data ?? []
  const recentAlerts  = stats?.recent_alerts ?? []
  const isLoading     = loading && analyticsLoading

  return (
    <div className="page-enter">

      {/* ══════════════════════════════════════════════════════
          1. Header + Filter Bar
          ══════════════════════════════════════════════════════ */}
      <div style={{ marginBottom:'20px' }}>
        <div style={{ fontSize:'12px', color:'#8b949e', marginBottom:'4px' }}>Dashboard {'\u203A'} Overview</div>
        <h1 style={{ fontSize:'22px', fontWeight:'700', color:'#e6edf3' }}>Dashboard</h1>
      </div>

      <div style={{
        display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap',
        marginBottom:'20px', padding:'14px 16px',
        background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:'12px',
      }}>
        <select value={range} onChange={e => setRange(e.target.value)} style={inputStyle}>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="3months">Last 3 Months</option>
        </select>

        <select value={zone} onChange={e => setZone(e.target.value)} style={inputStyle}>
          <option value="all">All Zones</option>
          {['Zone A','Zone B','Zone C','Zone D','Zone E'].map(z => (
            <option key={z}>{z}</option>
          ))}
        </select>

        <button
          onClick={fetchAll}
          style={{
            padding:'8px 18px',
            background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
            border:'none', borderRadius:'7px',
            color:'white', fontWeight:'700', fontSize:'13px', cursor:'pointer',
          }}
        >Apply Filters</button>

        <button
          onClick={handleExport}
          style={{
            padding:'8px 16px', marginLeft:'auto',
            background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
            borderRadius:'7px', color:'#22c55e', fontSize:'13px', cursor:'pointer',
            display:'flex', alignItems:'center', gap:'6px',
          }}
        >Export Report</button>
      </div>

      {/* ══════════════════════════════════════════════════════
          2. KPI Stats Cards (6 cards)
          ══════════════════════════════════════════════════════ */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'20px', flexWrap:'wrap' }}>
        <StatCard icon={'\uD83D\uDC65'} label="Total Workers Detected"
          value={isLoading ? '\u2026' : total.toLocaleString()}
          color="#3b82f6" change={summary?.changes?.total_workers} sub="vs last period" />
        <StatCard icon={'\u2705'} label="Compliant (Safe)"
          value={isLoading ? '\u2026' : compliant.toLocaleString()}
          color="#22c55e" sub={`${compRate}% of total`} change={summary?.changes?.compliant} />
        <StatCard icon={'\u26D1\uFE0F'}  label="No Helmet"
          value={isLoading ? '\u2026' : noHelmet.toLocaleString()}
          color="#f97316" sub={total > 0 ? `${Math.round(noHelmet/total*100)}% of total` : ''} change={summary?.changes?.no_helmet} />
        <StatCard icon={'\uD83E\uDDBA'} label="No Vest"
          value={isLoading ? '\u2026' : noVest.toLocaleString()}
          color="#eab308" sub={total > 0 ? `${Math.round(noVest/total*100)}% of total` : ''} change={summary?.changes?.no_vest} />
        <StatCard icon={'\uD83D\uDEA8'} label="No Helmet & No Vest"
          value={isLoading ? '\u2026' : bothMiss.toLocaleString()}
          color="#a855f7" sub={total > 0 ? `${Math.round(bothMiss/total*100)}% of total` : ''} change={summary?.changes?.no_helmet_and_no_vest} />
        <StatCard icon={'\uD83D\uDCCA'} label="Compliance Rate"
          value={isLoading ? '\u2026' : `${compRate}%`}
          color="#22c55e" change={summary?.changes?.compliance_rate} sub="vs last period" />
      </div>

      {/* ══════════════════════════════════════════════════════
          3. Recent Alerts + Live Safety Overview (2-col)
          ══════════════════════════════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>

        {/* ── Recent Alerts ── */}
        <SectionCard title="Recent Alerts" topRight={
          <a href="/alerts" style={{ fontSize:'12px', color:'#3b82f6', textDecoration:'none' }}>View All</a>
        }>
          {loading ? (
            <div style={{ color:'#8b949e', fontSize:'13px', textAlign:'center', padding:'20px' }}>Loading\u2026</div>
          ) : recentAlerts.length === 0 ? (
            <div style={{ color:'#8b949e', fontSize:'13px', textAlign:'center', padding:'20px' }}>
              <div style={{ fontSize:'28px', marginBottom:'8px' }}>\u2705</div>
              {'No alerts today \u2014 looking good!'}
            </div>
          ) : (
            recentAlerts.slice(0, 6).map((a, i) => <AlertRow key={a.id || i} alert={a} />)
          )}
        </SectionCard>

        {/* ── Live Safety Overview ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
          {/* Safety Compliance Donut */}
          <SectionCard title="Safety Compliance">
            <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
              <div style={{ position:'relative', width:'110px', height:'110px', flexShrink:0 }}>
                <PieChart width={110} height={110}>
                  <Pie data={donutData.length ? donutData : [{name:'No Data', value:1, color:'#374151'}]}
                    cx={55} cy={55} innerRadius={35} outerRadius={52} dataKey="value" paddingAngle={2}>
                    {(donutData.length ? donutData : [{color:'#374151'}]).map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div style={{
                  position:'absolute', inset:0,
                  display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center',
                }}>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#22c55e' }}>{compRate}%</div>
                  <div style={{ fontSize:'9px', color:'#8b949e' }}>Compliant</div>
                </div>
              </div>
              <div style={{ flex:1 }}>
                {[
                  { label:'Compliant', value:compliant, color:'#22c55e' },
                  { label:'No Helmet', value:noHelmet,  color:'#f97316' },
                  { label:'No Vest',   value:noVest,    color:'#eab308' },
                  { label:'No Helmet & No Vest', value:bothMiss, color:'#a855f7' },
                ].map(row => (
                  <div key={row.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px', fontSize:'12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:row.color, flexShrink:0 }} />
                      <span style={{ color:'#8b949e' }}>{row.label}</span>
                    </div>
                    <span style={{ color:row.color, fontWeight:'600' }}>
                      {row.value} ({total > 0 ? Math.round(row.value/total*100) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Top Violation Zones */}
          <SectionCard title="Top Violation Zones">
            {topZones.length === 0 ? (
              <div style={{ color:'#8b949e', fontSize:'13px', textAlign:'center', padding:'20px' }}>
                No zone data yet
              </div>
            ) : topZones.slice(0, 5).map((z, i) => {
              const maxVal = topZones[0]?.count || 1
              const barColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6']
              return (
                <div key={z.zone} style={{ marginBottom:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                    <span style={{ fontSize:'13px', color:'#e6edf3', fontWeight:'500' }}>{z.zone}</span>
                    <span style={{ fontSize:'13px', color:'#8b949e', fontWeight:'600' }}>{z.count}</span>
                  </div>
                  <div style={{ height:'6px', background:'var(--bg-primary)', borderRadius:'3px', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', width:`${(z.count / maxVal) * 100}%`,
                      background:barColors[i % barColors.length], borderRadius:'3px',
                      transition:'width 0.5s',
                    }} />
                  </div>
                </div>
              )
            })}
          </SectionCard>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          4+5. Violation Trend Charts + Violations by Zone (3-col)
          ══════════════════════════════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:'16px', marginBottom:'16px' }}>

        {/* ── Violation Trend Over Time ── */}
        <SectionCard
          title="Violation Trend Over Time"
          topRight={
            <div style={{ display:'flex', gap:'4px' }}>
              <RangeBtn active={trendGran==='hourly'} label="Hourly" onClick={() => { trendGranRef.current = 'hourly'; setTrendGran('hourly'); fetchAll() }} />
              <RangeBtn active={trendGran==='daily'}  label="Daily"  onClick={() => { trendGranRef.current = 'daily'; setTrendGran('daily'); fetchAll() }} />
            </div>
          }
        >
          {analyticsLoading ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e' }}>Loading\u2026</div>
          ) : trend.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e', flexDirection:'column' }}>
              <div style={{ fontSize:'32px', marginBottom:'8px' }}>\uD83D\uDCCA</div>
              <div>{'No data for selected range \u2014 seed alerts first'}</div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize:10, fill:'#8b949e' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:'#8b949e' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #30363d', borderRadius:'8px', fontSize:'12px' }} />
                  <Line type="monotone" dataKey="no_helmet"             stroke="#f97316" dot={false} strokeWidth={2} name="No Helmet" />
                  <Line type="monotone" dataKey="no_vest"               stroke="#eab308" dot={false} strokeWidth={2} name="No Vest" />
                  <Line type="monotone" dataKey="no_helmet_and_no_vest" stroke="#a855f7" dot={false} strokeWidth={2} name="Both" />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', gap:'16px', marginTop:'8px', flexWrap:'wrap' }}>
                {[['#f97316','No Helmet'],['#eab308','No Vest'],['#a855f7','No Helmet & No Vest']].map(([c,l]) => (
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#8b949e' }}>
                    <div style={{ width:'12px', height:'3px', background:c, borderRadius:'2px' }} />{l}
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>

        {/* ── Violations by Zone (Donut) ── */}
        <SectionCard title="Violations by Zone">
          {analyticsLoading || byZone.zones.length === 0 ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'12px' }}>
              {analyticsLoading ? 'Loading\u2026' : 'No zone data yet'}
            </div>
          ) : (
            <>
              <div style={{ position:'relative' }}>
                <PieChart width={180} height={180} style={{ margin:'0 auto' }}>
                  <Pie data={byZone.zones.slice(0,5)} cx={90} cy={90} innerRadius={50} outerRadius={80} dataKey="total" paddingAngle={2}>
                    {byZone.zones.slice(0,5).map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #30363d', borderRadius:'8px', fontSize:'11px' }} />
                </PieChart>
                <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center' }}>
                  <div style={{ fontSize:'18px', fontWeight:'700', color:'#e6edf3' }}>{byZone.grand_total}</div>
                  <div style={{ fontSize:'9px', color:'#8b949e' }}>Total</div>
                </div>
              </div>
              <div style={{ marginTop:'8px' }}>
                {byZone.zones.slice(0,5).map((z, i) => (
                  <div key={z.zone} style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px', fontSize:'12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:ZONE_COLORS[i%ZONE_COLORS.length], flexShrink:0 }} />
                      <span style={{ color:'#8b949e' }}>{z.zone}</span>
                    </div>
                    <span style={{ color:'#e6edf3', fontWeight:'600' }}>{z.total} ({z.pct}%)</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ══════════════════════════════════════════════════════
          7. AI Insights Panel
          ══════════════════════════════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>

        {/* ── AI Insights from Analytics ── */}
        <SectionCard title="AI Insights">
          {!groqConfigured ? (
            <div style={{ fontSize:'12px', color:'#8b949e', lineHeight:1.7 }}>
              Add <code style={{ color:'#6366f1' }}>GROQ_API_KEY</code> to backend/.env to enable AI insights.
              <br /><br />
              <a href="https://console.groq.com" target="_blank" rel="noreferrer"
                style={{ color:'#6366f1', fontSize:'12px' }}>{'Get Free Key \u2192'}</a>
            </div>
          ) : insightLoad ? (
            <div style={{ fontSize:'12px', color:'#8b949e', textAlign:'center', padding:'20px' }}>
              <div style={{ fontSize:'24px', marginBottom:'8px' }}>\uD83E\uDD16</div>
              Generating insights\u2026
            </div>
          ) : insight ? (
            <>
              {insight.risk_level && (
                <div style={{
                  display:'inline-flex', alignItems:'center', gap:'5px',
                  padding:'3px 10px', borderRadius:'12px', marginBottom:'10px', fontSize:'11px', fontWeight:'700',
                  background: insight.risk_level === 'high' ? 'rgba(239,68,68,0.15)' : insight.risk_level === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                  color:      insight.risk_level === 'high' ? '#ef4444'              : insight.risk_level === 'medium' ? '#eab308'              : '#22c55e',
                }}>
                  \u25CF {insight.risk_level.toUpperCase()} RISK
                </div>
              )}
              <div>
                {(insight.recommendations || [insight.summary]).filter(Boolean).slice(0,4).map((r, i) => (
                  <div key={i} style={{ display:'flex', gap:'8px', marginBottom:'8px', fontSize:'12px', color:'#8b949e', lineHeight:1.5 }}>
                    <span style={{ color:'#6366f1', flexShrink:0 }}>\u2022</span>
                    <span>{typeof r === 'string' ? r : r.action || r}</span>
                  </div>
                ))}
              </div>
              <a href="/reports" style={{
                display:'block', marginTop:'12px', padding:'7px',
                textAlign:'center', background:'rgba(99,102,241,0.1)',
                border:'1px solid rgba(99,102,241,0.3)', borderRadius:'7px',
                color:'#818cf8', fontSize:'12px', fontWeight:'600', textDecoration:'none',
              }}>\uD83D\uDCC4 View Detailed Report</a>
            </>
          ) : (
            <div style={{ fontSize:'12px', color:'#8b949e', textAlign:'center', padding:'20px' }}>
              Apply filters to generate insights
            </div>
          )}
        </SectionCard>

        {/* ── Live AI Insight (from Dashboard - real-time) ── */}
        <SectionCard title="Live AI Safety Insight">
          <LiveAIInsight autoLoad={true} compact={false} range={range} zone={zone} />
        </SectionCard>

      </div>

      {/* ══════════════════════════════════════════════════════
          6+8. Compliance Charts + Heatmap (2-col)
          ══════════════════════════════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>

        {/* ── Compliance Rate Over Time ── */}
        <SectionCard title="Compliance Rate Over Time">
          {analyticsLoading || compTrend.length === 0 ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'12px' }}>
              {analyticsLoading ? 'Loading\u2026' : 'No compliance trend data yet'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={compTrend}>
                <defs>
                  <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize:10, fill:'#8b949e' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0,100]} tick={{ fontSize:10, fill:'#8b949e' }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ background:'#1f2937', border:'1px solid #30363d', borderRadius:'8px', fontSize:'12px' }}
                  formatter={v => [`${v}%`, 'Compliance']}
                />
                <Area type="monotone" dataKey="compliance_rate" stroke="#22c55e" fill="url(#compGrad)"
                  strokeWidth={2} dot={{ fill:'#22c55e', r:4 }} name="Compliance Rate"
                  label={{ position:'top', fontSize:10, fill:'#22c55e', formatter: v => `${v}%` }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* ── Violations by Time of Day (Heatmap) ── */}
        <SectionCard title="Violations by Time of Day">
          {analyticsLoading ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e' }}>Loading\u2026</div>
          ) : (
            <Heatmap
              data={heatmap.heatmap}
              days={heatmap.days || []}
              buckets={heatmap.buckets || []}
              maxCount={heatmap.max_count || 1}
            />
          )}
        </SectionCard>

      </div>

      {/* ══════════════════════════════════════════════════════
          9. Zone-wise Summary Table
          ══════════════════════════════════════════════════════ */}
      <div style={{ marginBottom:'16px' }}>
        <SectionCard title="Zone-wise Summary">
          <ZoneSummaryTable rows={zoneSummary} loading={analyticsLoading} />
        </SectionCard>
      </div>

      {/* ══════════════════════════════════════════════════════
          10+11. Detection Summary + Report Actions
          ══════════════════════════════════════════════════════ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:'16px' }}>

        {/* ── Detection Summary ── */}
        <SectionCard title="Detection Summary">
          <DetectionSummaryCard data={detectionSum} loading={analyticsLoading} />
        </SectionCard>

        {/* ── Report Actions ── */}
        <SectionCard title="Report Actions">
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            <a href="/reports" style={{
              display:'block', padding:'10px', textAlign:'center',
              background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)',
              borderRadius:'7px', color:'#818cf8', fontSize:'12px', fontWeight:'600',
              textDecoration:'none', transition:'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)' }}
            >Generate Full Report</a>
            <a href="/alerts" style={{
              display:'block', padding:'10px', textAlign:'center',
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
              borderRadius:'7px', color:'#ef4444', fontSize:'12px', fontWeight:'600',
              textDecoration:'none', transition:'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            >View All Alerts</a>
            <button
              onClick={handleExport}
              style={{
                display:'block', width:'100%', padding:'10px', textAlign:'center', cursor:'pointer',
                background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)',
                borderRadius:'7px', color:'#22c55e', fontSize:'12px', fontWeight:'600',
                transition:'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.08)' }}
            > Export Report</button>
          </div>
        </SectionCard>

      </div>

    </div>
  )
}
