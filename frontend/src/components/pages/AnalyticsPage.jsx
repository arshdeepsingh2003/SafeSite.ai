// ============================================================
// SafeSite AI — Analytics Page  (Phase 11)
// File: frontend/src/components/pages/AnalyticsPage.jsx
//
// Sections (matching the design exactly):
//   • Filter bar — date range, camera, zone, Apply + Export
//   • 6 stat cards — workers, compliant, no helmet, no vest, both, compliance %
//   • Violation Trend Over Time — line chart (daily/weekly toggle)
//   • Violations by Zone — donut chart
//   • AI Insights panel
//   • Violations by Time of Day — heatmap
//   • Compliance Rate Over Time — area chart
//   • Top 5 Violation Zones — horizontal bar chart
//   • Zone-wise Summary — full table
//   • Detection Summary — video stats
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid,
} from 'recharts'
import { useLLM }    from '../../hooks/useLLM'
import api  from '../../services/api'
import toast from 'react-hot-toast'

// ── Palette ───────────────────────────────────────────────────
const ZONE_COLORS  = ['#ef4444','#f97316','#22c55e','#3b82f6','#a855f7']
const VIOL_COLORS  = { no_helmet: '#f97316', no_vest: '#eab308', no_helmet_and_no_vest: '#a855f7' }

// ── Small helpers ─────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, change }) {
  const up = change > 0
  return (
    <div style={{
      background:'var(--bg-secondary)', border:'1px solid var(--border)',
      borderRadius:'12px', padding:'16px 18px',
      display:'flex', alignItems:'center', gap:'14px', flex:1,
    }}>
      <div style={{
        width:'44px', height:'44px', borderRadius:'10px', flexShrink:0,
        background:`${color}18`,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px',
      }}>{icon}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'11px', color:'#8b949e', marginBottom:'2px' }}>{label}</div>
        <div style={{ fontSize:'22px', fontWeight:'700', color, lineHeight:1.1 }}>{value}</div>
        <div style={{ fontSize:'11px', marginTop:'3px', display:'flex', gap:'6px', alignItems:'center' }}>
          {change !== undefined && (
            <span style={{ color: up ? '#22c55e' : '#ef4444', fontWeight:'600' }}>
              {up ? '↑' : '↓'} {Math.abs(change)}%
            </span>
          )}
          {sub && <span style={{ color:'#8b949e' }}>{sub}</span>}
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, topRight, children, style = {} }) {
  return (
    <div style={{
      background:'var(--bg-secondary)', border:'1px solid var(--border)',
      borderRadius:'12px', padding:'18px', ...style,
    }}>
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

function RangeBtn({ active, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'4px 10px', fontSize:'11px', fontWeight:'600', border:'none', cursor:'pointer',
      borderRadius:'6px',
      background: active ? 'var(--accent-blue)' : 'var(--bg-primary)',
      color:      active ? 'white' : '#8b949e',
    }}>{label}</button>
  )
}

// ── Heatmap ───────────────────────────────────────────────────
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
      {/* Column headers (days) */}
      <div style={{ display:'grid', gridTemplateColumns:`80px repeat(${days.length}, 1fr)`, gap:'4px', marginBottom:'4px' }}>
        <div />
        {days.map(d => (
          <div key={d} style={{ fontSize:'10px', color:'#8b949e', textAlign:'center', fontWeight:'600' }}>{d}</div>
        ))}
      </div>
      {/* Rows (time buckets) */}
      {buckets.map(bucket => (
        <div key={bucket} style={{ display:'grid', gridTemplateColumns:`80px repeat(${days.length}, 1fr)`, gap:'4px', marginBottom:'4px' }}>
          <div style={{ fontSize:'10px', color:'#8b949e', display:'flex', alignItems:'center', paddingRight:'8px' }}>{bucket}</div>
          {days.map(day => cell(day, bucket))}
        </div>
      ))}
      {/* Legend */}
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

// ── Main Component ────────────────────────────────────────────
export default function AnalyticsPage() {
  // ── Filters ──
  const [range,    setRange]    = useState('week')
  const [zone,     setZone]     = useState('all')
  const [trendGran, setTrendGran] = useState('daily')

  // ── Data ──
  const [summary,       setSummary]       = useState(null)
  const [trend,         setTrend]         = useState([])
  const [byZone,        setByZone]        = useState({ zones:[], grand_total:0 })
  const [heatmap,       setHeatmap]       = useState({ heatmap:[], days:[], buckets:[], max_count:1 })
  const [compTrend,     setCompTrend]     = useState([])
  const [zoneSummary,   setZoneSummary]   = useState([])
  const [detectionSum,  setDetectionSum]  = useState(null)
  const [loading,       setLoading]       = useState(true)

  // ── LLM Insights ──
  const { analyzeDetections, isConfigured: groqConfigured } = useLLM()
  const [insight,     setInsight]     = useState(null)
  const [insightLoad, setInsightLoad] = useState(false)

  // ── Fetch all data ────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, tRes, zRes, hRes, cRes, zsRes, dRes] = await Promise.all([
        api.get(`/analytics/summary?range=${range}&zone=${zone}`),
        api.get(`/analytics/trend?range=${range}&granularity=${trendGran}&zone=${zone}`),
        api.get(`/analytics/by-zone?range=${range}`),
        api.get(`/analytics/by-time-of-day?range=${range}`),
        api.get(`/analytics/compliance-trend?weeks=4`),
        api.get(`/analytics/zone-summary?range=${range}`),
        api.get(`/analytics/detection-summary?range=${range}`),
      ])
      setSummary(sRes.data)
      setTrend(tRes.data.data || [])
      setByZone(zRes.data)
      setHeatmap(hRes.data)
      setCompTrend(cRes.data.weeks || [])
      setZoneSummary(zsRes.data.rows || [])
      setDetectionSum(dRes.data)
    } catch (err) {
      console.error('Analytics fetch error:', err)
      toast.error('Could not load analytics data')
    } finally {
      setLoading(false)
    }
  }, [range, zone, trendGran])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Generate AI insight when summary loads ────────────────
  useEffect(() => {
    if (!summary || !groqConfigured) return
    async function loadInsight() {
      setInsightLoad(true)
      try {
        const result = await analyzeDetections({
          total_workers:      summary.total_workers,
          compliant_workers:  summary.compliant,
          no_helmet_count:    summary.no_helmet,
          no_vest_count:      summary.no_vest,
          both_missing_count: summary.no_helmet_and_no_vest,
          compliance_rate:    summary.compliance_rate,
          zones_affected:     byZone.zones.slice(0,3).map(z => z.zone),
          top_violation_zone: byZone.zones[0]?.zone || 'Zone A',
          frame_count:        summary.total_violations * 5,
        })
        setInsight(result)
      } catch { /* silently ignore */ }
      finally { setInsightLoad(false) }
    }
    loadInsight()
  }, [summary?.total_violations, groqConfigured])

  // ── Export report ─────────────────────────────────────────
  function handleExport() {
    if (!summary) return
    const lines = [
      `SafeSite AI — Analytics Report`,
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

  const s = summary
  const inputStyle = {
    padding:'8px 12px', background:'var(--bg-primary)',
    border:'1px solid var(--border)', borderRadius:'7px',
    color:'#e6edf3', fontSize:'13px', outline:'none',
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ marginBottom:'20px' }}>
        <div style={{ fontSize:'12px', color:'#8b949e', marginBottom:'4px' }}>Dashboard › Analytics</div>
        <h1 style={{ fontSize:'22px', fontWeight:'700', color:'#e6edf3' }}>Analytics</h1>
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap',
        marginBottom:'20px', padding:'14px 16px',
        background:'var(--bg-secondary)', border:'1px solid var(--border)', borderRadius:'12px',
      }}>
        {/* Date range */}
        <select value={range} onChange={e => setRange(e.target.value)} style={inputStyle}>
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="3months">Last 3 Months</option>
        </select>

        {/* Zone filter */}
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
            background:'var(--bg-primary)', border:'1px solid var(--border)',
            borderRadius:'7px', color:'#e6edf3', fontSize:'13px', cursor:'pointer',
            display:'flex', alignItems:'center', gap:'6px',
          }}
        >⬇ Export Report</button>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'20px', flexWrap:'wrap' }}>
        <StatCard icon="👥" label="Total Workers Detected"
          value={loading ? '…' : (s?.total_workers ?? 0).toLocaleString()}
          color="#3b82f6" change={s?.changes?.total_workers} sub="vs last period" />
        <StatCard icon="✅" label="Compliant (Safe)"
          value={loading ? '…' : (s?.compliant ?? 0).toLocaleString()}
          color="#22c55e" sub={`${s?.compliance_rate ?? 0}% of total`} change={s?.changes?.compliant} />
        <StatCard icon="⛑️"  label="No Helmet"
          value={loading ? '…' : (s?.no_helmet ?? 0).toLocaleString()}
          color="#f97316" sub={s?.total_workers ? `${Math.round((s.no_helmet/s.total_workers)*100)}% of total` : ''} change={s?.changes?.no_helmet} />
        <StatCard icon="🦺" label="No Vest"
          value={loading ? '…' : (s?.no_vest ?? 0).toLocaleString()}
          color="#eab308" sub={s?.total_workers ? `${Math.round((s.no_vest/s.total_workers)*100)}% of total` : ''} change={s?.changes?.no_vest} />
        <StatCard icon="🚨" label="No Helmet & No Vest"
          value={loading ? '…' : (s?.no_helmet_and_no_vest ?? 0).toLocaleString()}
          color="#a855f7" sub={s?.total_workers ? `${Math.round((s.no_helmet_and_no_vest/s.total_workers)*100)}% of total` : ''} change={s?.changes?.no_helmet_and_no_vest} />
        <StatCard icon="📊" label="Compliance Rate"
          value={loading ? '…' : `${s?.compliance_rate ?? 0}%`}
          color="#22c55e" change={s?.changes?.compliance_rate} sub="vs last period" />
      </div>

      {/* ── Row 2: Trend + Zone Donut + AI Insights ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px 260px', gap:'16px', marginBottom:'16px' }}>

        {/* Violation Trend */}
        <SectionCard
          title="Violation Trend Over Time"
          topRight={
            <div style={{ display:'flex', gap:'4px' }}>
              <RangeBtn active={trendGran==='hourly'} label="Hourly" onClick={() => setTrendGran('hourly')} />
              <RangeBtn active={trendGran==='daily'}  label="Daily"  onClick={() => setTrendGran('daily')}  />
            </div>
          }
        >
          {loading ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e' }}>Loading…</div>
          ) : trend.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e', flexDirection:'column' }}>
              <div style={{ fontSize:'32px', marginBottom:'8px' }}>📊</div>
              <div>No data for selected range — seed alerts first</div>
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

        {/* Violations by Zone — Donut */}
        <SectionCard title="Violations by Zone">
          {loading || byZone.zones.length === 0 ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'12px' }}>
              {loading ? 'Loading…' : 'No zone data yet'}
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

        {/* AI Insights */}
        <SectionCard title="🤖 AI Insights">
          {!groqConfigured ? (
            <div style={{ fontSize:'12px', color:'#8b949e', lineHeight:1.7 }}>
              Add <code style={{ color:'#6366f1' }}>GROQ_API_KEY</code> to backend/.env to enable AI insights.
              <br /><br />
              <a href="https://console.groq.com" target="_blank" rel="noreferrer"
                style={{ color:'#6366f1', fontSize:'12px' }}>Get Free Key →</a>
            </div>
          ) : insightLoad ? (
            <div style={{ fontSize:'12px', color:'#8b949e', textAlign:'center', padding:'20px' }}>
              <div style={{ fontSize:'24px', marginBottom:'8px' }}>🤖</div>
              Generating insights…
            </div>
          ) : insight ? (
            <>
              {/* Risk badge */}
              {insight.risk_level && (
                <div style={{
                  display:'inline-flex', alignItems:'center', gap:'5px',
                  padding:'3px 10px', borderRadius:'12px', marginBottom:'10px', fontSize:'11px', fontWeight:'700',
                  background: insight.risk_level === 'high' ? 'rgba(239,68,68,0.15)' : insight.risk_level === 'medium' ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                  color:      insight.risk_level === 'high' ? '#ef4444'              : insight.risk_level === 'medium' ? '#eab308'              : '#22c55e',
                }}>
                  ● {insight.risk_level.toUpperCase()} RISK
                </div>
              )}
              {/* Bullet points */}
              <div>
                {(insight.recommendations || [insight.summary]).filter(Boolean).slice(0,4).map((r, i) => (
                  <div key={i} style={{ display:'flex', gap:'8px', marginBottom:'8px', fontSize:'12px', color:'#8b949e', lineHeight:1.5 }}>
                    <span style={{ color:'#6366f1', flexShrink:0 }}>•</span>
                    <span>{typeof r === 'string' ? r : r.action || r}</span>
                  </div>
                ))}
              </div>
              <a href="/reports" style={{
                display:'block', marginTop:'12px', padding:'7px',
                textAlign:'center', background:'rgba(99,102,241,0.1)',
                border:'1px solid rgba(99,102,241,0.3)', borderRadius:'7px',
                color:'#818cf8', fontSize:'12px', fontWeight:'600', textDecoration:'none',
              }}>📄 View Detailed Report</a>
            </>
          ) : (
            <div style={{ fontSize:'12px', color:'#8b949e', textAlign:'center', padding:'20px' }}>
              Apply filters to generate insights
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Row 3: Heatmap + Compliance Trend + Top Zones ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 260px', gap:'16px', marginBottom:'16px' }}>

        {/* Time-of-Day Heatmap */}
        <SectionCard title="Violations by Time of Day">
          {loading ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e' }}>Loading…</div>
          ) : (
            <Heatmap
              data={heatmap.heatmap}
              days={heatmap.days || []}
              buckets={heatmap.buckets || []}
              maxCount={heatmap.max_count || 1}
            />
          )}
        </SectionCard>

        {/* Compliance Rate Over Time — Area Chart */}
        <SectionCard title="Compliance Rate Over Time">
          {loading || compTrend.length === 0 ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'12px' }}>
              {loading ? 'Loading…' : 'No compliance trend data yet'}
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

        {/* Top 5 Violation Zones — Horizontal Bar */}
        <SectionCard title="Top 5 Violation Zones">
          {loading || byZone.zones.length === 0 ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'12px' }}>
              {loading ? 'Loading…' : 'No zone data'}
            </div>
          ) : (
            <div>
              {byZone.zones.slice(0,5).map((z, i) => {
                const maxV = byZone.zones[0]?.total || 1
                return (
                  <div key={z.zone} style={{ marginBottom:'12px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                      <span style={{ fontSize:'12px', color:'#e6edf3', fontWeight:'500' }}>{z.zone}</span>
                      <span style={{ fontSize:'12px', fontWeight:'700', color: ZONE_COLORS[i % ZONE_COLORS.length] }}>{z.total}</span>
                    </div>
                    <div style={{ height:'8px', background:'var(--bg-primary)', borderRadius:'4px', overflow:'hidden' }}>
                      <div style={{
                        height:'100%', width:`${(z.total / maxV) * 100}%`,
                        background: ZONE_COLORS[i % ZONE_COLORS.length],
                        borderRadius:'4px', transition:'width 0.5s',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Row 4: Zone Summary Table + Detection Summary ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:'16px' }}>

        {/* Zone-wise Summary Table */}
        <SectionCard title="Zone-wise Summary">
          {loading ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e' }}>Loading…</div>
          ) : zoneSummary.length === 0 ? (
            <div style={{ textAlign:'center', padding:'30px', color:'#8b949e', fontSize:'13px' }}>
              <div style={{ fontSize:'32px', marginBottom:'8px' }}>📊</div>
              No zone data yet. Run <code style={{ color:'#6366f1' }}>python seed_alerts.py</code> to generate sample data.
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              {/* Header */}
              <div style={{
                display:'grid', gridTemplateColumns:'100px 100px 90px 90px 80px 130px 110px',
                padding:'8px 10px', borderBottom:'1px solid var(--border)',
                fontSize:'10px', color:'#8b949e', fontWeight:'700', textTransform:'uppercase',
              }}>
                {['Zone','Workers','Compliant','No Helmet','No Vest','No Hlmt+Vest','Compliance'].map(h => (
                  <div key={h}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              {zoneSummary.map(row => (
                <div key={row.zone} style={{
                  display:'grid', gridTemplateColumns:'100px 100px 90px 90px 80px 130px 110px',
                  padding:'10px 10px', borderBottom:'1px solid var(--border)',
                  fontSize:'12px', alignItems:'center',
                }}>
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
                  {/* Compliance rate bar */}
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <div style={{ flex:1, height:'5px', background:'var(--bg-primary)', borderRadius:'3px', overflow:'hidden' }}>
                        <div style={{
                          height:'100%', width:`${row.compliance_rate}%`,
                          background: row.compliance_rate >= 70 ? '#22c55e' : row.compliance_rate >= 50 ? '#eab308' : '#ef4444',
                          borderRadius:'3px',
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
          )}
        </SectionCard>

        {/* Detection Summary */}
        <SectionCard title="Detection Summary">
          {[
            { icon:'🎬', label:'Total Videos Analyzed', value: detectionSum?.videos_analyzed ?? '—' },
            { icon:'⏱',  label:'Total Duration',         value: detectionSum ? `${detectionSum.total_duration_hours}h` : '—' },
            { icon:'📈', label:'Avg. Detection Conf.',  value: detectionSum ? `${detectionSum.avg_confidence}%` : '—' },
            { icon:'🎯', label:'Total Detections',      value: detectionSum?.total_detections?.toLocaleString() ?? '—' },
            { icon:'🚨', label:'Total Alerts Created',  value: detectionSum?.total_alerts?.toLocaleString() ?? '—' },
          ].map(item => (
            <div key={item.label} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 0', borderBottom:'1px solid var(--border)',
              fontSize:'12px',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'#8b949e' }}>
                <span>{item.icon}</span> {item.label}
              </div>
              <span style={{ fontWeight:'700', color:'#e6edf3' }}>{loading ? '…' : item.value}</span>
            </div>
          ))}

          {/* Quick links */}
          <div style={{ marginTop:'16px', display:'flex', flexDirection:'column', gap:'8px' }}>
            <a href="/reports" style={{
              display:'block', padding:'8px', textAlign:'center',
              background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)',
              borderRadius:'7px', color:'#818cf8', fontSize:'12px', fontWeight:'600',
              textDecoration:'none',
            }}>📄 Generate Full Report</a>
            <a href="/alerts" style={{
              display:'block', padding:'8px', textAlign:'center',
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
              borderRadius:'7px', color:'#ef4444', fontSize:'12px', fontWeight:'600',
              textDecoration:'none',
            }}>🚨 View All Alerts</a>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}