// ============================================================
// SafeSite AI — Reports Page  (Phase 12 — full rebuild)
// File: frontend/src/components/pages/ReportsPage.jsx
//
// Sections (matching design):
//   • Filter bar  — Report Type, Date Range, Site, Zone, Generate
//   • 6 Stat cards — Total Reports, Compliance, Violations, Workers, High Risk, Cameras
//   • Report Overview — donut + violation breakdown list
//   • Violations Trend — line chart (Daily / Weekly toggle)
//   • Report Insights — Groq AI bullet points
//   • Generated Reports table — paginated list with actions
//   • Report Preview panel — full text + download button
// ============================================================

import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useReports }  from '../../hooks/useReports'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useLLM }       from '../../hooks/useLLM'
import toast from 'react-hot-toast'
import api from '../../services/api'

// ── Tiny helpers ──────────────────────────────────────────────
function StatCard({ icon, label, value, change, sub, color }) {
  const up = change > 0
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '16px 18px', flex: 1, minWidth: '130px',
      display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '1px' }}>{label}</div>
        <div style={{ fontSize: '20px', fontWeight: '700', color, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '1px' }}>{sub}</div>}
        {change !== undefined && change !== 0 && (
          <div style={{ fontSize: '11px', color: up ? '#22c55e' : '#ef4444', marginTop: '2px' }}>
            {up ? '↑' : '↓'} {Math.abs(change)}% vs last week
          </div>
        )}
      </div>
    </div>
  )
}

function TypeBadge({ type }) {
  const map = {
    daily:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
    weekly:  { color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
    monthly: { color: '#a855f7', bg: 'rgba(168,85,247,0.12)'  },
    zone:    { color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
    custom:  { color: '#eab308', bg: 'rgba(234,179,8,0.12)'   },
  }
  const s = map[type] || map.custom
  return (
    <span style={{
      padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
      background: s.bg, color: s.color, textTransform: 'capitalize',
    }}>{type}</span>
  )
}

// ── Report Preview Panel ──────────────────────────────────────
function ReportPreview({ report, onDownload }) {
  if (!report) return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '36px', marginBottom: '12px' }}>📄</div>
      <div style={{ fontSize: '13px', color: '#8b949e', lineHeight: 1.6 }}>
        Click on a report row to preview it, or generate a new report above.
      </div>
    </div>
  )

  const s = report.stats || {}

  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      {/* Preview header */}
      <div style={{
        padding: '16px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>
          Report Preview
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#f97316' }}>🦺 SafeSite</span>
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#3b82f6' }}>AI</span>
        </div>
      </div>

      {/* Report content */}
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: '#e6edf3', marginBottom: '3px' }}>
          {report.name}
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '12px' }}>
          {report.date_range} • {report.site === 'all' ? 'All Sites' : report.site}
        </div>

        {/* Mini stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
          {[
            { label: 'Total Workers',   value: s.total_workers     ?? 0, color: '#3b82f6' },
            { label: 'Compliance Rate', value: `${s.compliance_rate ?? 0}%`, color: '#22c55e' },
            { label: 'Violations',      value: s.total_violations  ?? 0, color: '#ef4444' },
            { label: 'High Risk',       value: s.high_risk_alerts  ?? 0, color: '#a855f7' },
          ].map(c => (
            <div key={c.label} style={{
              padding: '8px 10px', background: 'var(--bg-primary)',
              borderRadius: '7px', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '2px' }}>{c.label}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* AI Summary excerpt */}
        {(() => {
          const text = typeof report.llm_summary === 'string'
            ? report.llm_summary
            : report.llm_summary?.executive_summary || ''
          if (!text) return null
          return (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(99,102,241,0.07)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '8px', marginBottom: '14px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#818cf8', marginBottom: '5px' }}>
                🤖 AI EXECUTIVE SUMMARY
              </div>
              <div style={{ fontSize: '11px', color: '#8b949e', lineHeight: 1.6 }}>
                {text.slice(0, 280)}{text.length > 280 ? '…' : ''}
              </div>
            </div>
          )
        })()}

        {/* Top zones */}
        {report.top_zones?.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#e6edf3', marginBottom: '8px' }}>
              Top Violation Zones
            </div>
            {report.top_zones.slice(0, 4).map((z, i) => {
              const maxCount = report.top_zones[0]?.count || 1
              const barColors = ['#ef4444', '#f97316', '#eab308', '#22c55e']
              return (
                <div key={z.zone} style={{ marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', color: '#e6edf3' }}>{z.zone}</span>
                    <span style={{ fontSize: '11px', color: '#8b949e' }}>{z.count}</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--bg-primary)', borderRadius: '2px' }}>
                    <div style={{
                      height: '100%', width: `${(z.count / maxCount) * 100}%`,
                      background: barColors[i % barColors.length], borderRadius: '2px',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Download button */}
        <button
          onClick={() => onDownload(report.id, report.name)}
          style={{
            width: '100%', padding: '11px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', borderRadius: '8px',
            color: 'white', fontWeight: '700', fontSize: '13px',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '8px',
          }}
        >⬇ Download Full Report</button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function ReportsPage() {
  // Filters
  const [reportType, setReportType] = useState('all')
  const [genType,    setGenType]    = useState('daily')
  const [zone,       setZone]       = useState('all')
  const [site,       setSite]       = useState('all')
  const [trendGran,  setTrendGran]  = useState('daily')
  const [page,       setPage]       = useState(1)
  const [selected,   setSelected]   = useState(null)   // report being previewed

  const {
    reports, summary, total, loading, generating,
    totalPages, generateReport, getReport, downloadReport, deleteReport,
  } = useReports({ typeFilter: reportType, page, limit: 5 })

  // Analytics for trend chart + donut
  const { trend, loading: analyticsLoading } = useAnalytics({
    range: 'week', zone, granularity: trendGran,
  })

  // Groq for AI insights
  const { analyzeDetections, isConfigured: groqReady } = useLLM()
  const [insights,     setInsights]     = useState([])
  const [insightLoad,  setInsightLoad]  = useState(false)

  // Load AI insights when summary is ready
  useEffect(() => {
    if (!summary || !groqReady) return
    async function loadInsights() {
      setInsightLoad(true)
      try {
        const res = await analyzeDetections({
          zone:                  'Zone A',
          total_workers:         summary.workers_detected,
          compliant:             Math.round(summary.workers_detected * (summary.compliance_rate / 100)),
          no_helmet:             Math.round(summary.total_violations * 0.45),
          no_vest:               Math.round(summary.total_violations * 0.35),
          no_helmet_and_no_vest: summary.high_risk_alerts,
          compliance_rate:       summary.compliance_rate,
          frames_analyzed:       summary.total_violations * 5,
        })
        // Turn recommendations into bullet points
        if (res?.recommendations?.length) {
          setInsights(res.recommendations)
        } else if (res?.summary) {
          // Split summary into sentences as bullets
          setInsights(res.summary.split('. ').filter(s => s.length > 10).slice(0, 5))
        }
      } catch { /* silently ignore */ }
      finally { setInsightLoad(false) }
    }
    loadInsights()
  }, [summary?.total_violations, groqReady])

  // When user clicks a report row — fetch full content
  async function handleSelectReport(r) {
    if (selected?.id === r.id) { setSelected(null); return }
    const full = await getReport(r.id)
    setSelected(full)
  }

  // Generate + auto-select + download the new report
  async function handleGenerate() {
    const report = await generateReport({ type: genType, zone, site })
    if (report) {
      setSelected(report)
      await downloadReport(report.id, report.name)
    }
  }

  const s   = summary
  const inputStyle = {
    padding: '8px 12px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: '7px',
    color: '#e6edf3', fontSize: '13px', outline: 'none',
  }

  // Donut data from summary
  const noHelmet = summary ? Math.round((summary.total_violations || 0) * 0.45) : 0
  const noVest   = summary ? Math.round((summary.total_violations || 0) * 0.35) : 0
  const both     = summary?.high_risk_alerts || 0
  const compliant = Math.max(0, (summary?.workers_detected || 0) - (summary?.total_violations || 0))
  const donutData = [
    { name: 'No Helmet',  value: noHelmet,  color: '#f97316' },
    { name: 'No Vest',    value: noVest,    color: '#eab308' },
    { name: 'Both',       value: both,      color: '#a855f7' },
    { name: 'Safe',       value: compliant, color: '#22c55e' },
  ].filter(d => d.value > 0)

  return (
    <div>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
          Dashboard › Reports
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Reports</h1>
      </div>

      {/* ── Filter / Generate Bar ── */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
        marginBottom: '20px', padding: '14px 16px',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '5px' }}>Report Type</div>
          <select value={genType} onChange={e => setGenType(e.target.value)} style={inputStyle}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="zone">Zone</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '5px' }}>Site</div>
          <select value={site} onChange={e => setSite(e.target.value)} style={inputStyle}>
            <option value="all">All Sites</option>
            <option value="Main Site">Main Construction Site</option>
            <option value="North Zone Site">North Zone Site</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '5px' }}>Zone</div>
          <select value={zone} onChange={e => setZone(e.target.value)} style={inputStyle}>
            <option value="all">All Zones</option>
            {['Zone A','Zone B','Zone C','Zone D','Zone E'].map(z => <option key={z}>{z}</option>)}
          </select>
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: '9px 22px', marginLeft: 'auto',
            background: generating
              ? 'rgba(99,102,241,0.3)'
              : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', borderRadius: '8px',
            color: 'white', fontWeight: '700', fontSize: '13px',
            cursor: generating ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            alignSelf: 'flex-end',
          }}
        >
          {generating
            ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Generating…</>
            : '📄 Generate Report'}
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <StatCard icon="📋" label="Total Reports"    value={loading ? '…' : s?.total_reports    ?? 0}  color="#3b82f6" sub="Generated this period" />
        <StatCard icon="✅" label="Compliance Rate"  value={loading ? '…' : `${s?.compliance_rate ?? 0}%`} color="#22c55e" change={s?.changes?.compliance_rate} />
        <StatCard icon="⛑️"  label="Total Violations" value={loading ? '…' : s?.total_violations  ?? 0}  color="#ef4444" change={s?.changes?.total_violations} />
        <StatCard icon="👥" label="Workers Detected" value={loading ? '…' : (s?.workers_detected ?? 0).toLocaleString()} color="#f97316" change={s?.changes?.workers_detected} />
        <StatCard icon="🚨" label="High Risk Alerts" value={loading ? '…' : s?.high_risk_alerts   ?? 0}  color="#a855f7" change={s?.changes?.high_risk_alerts} />
        <StatCard icon="📹" label="Total Cameras"    value={loading ? '…' : s?.total_cameras      ?? 0}  color="#6366f1" sub="Active in site" />
      </div>

      {/* ── Main Grid: Overview + Trend + Insights ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: '16px', marginBottom: '16px' }}>

        {/* Report Overview — donut */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '4px' }}>
            Report Overview
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '14px' }}>
            Key insights from selected period
          </div>

          {/* Violation list */}
          {[
            { icon: '⛑️',  label: 'No Helmet',        value: noHelmet,  pct: summary?.total_violations ? Math.round(noHelmet/summary.total_violations*100) : 0,  color: '#f97316' },
            { icon: '🦺', label: 'No Vest',           value: noVest,    pct: summary?.total_violations ? Math.round(noVest/summary.total_violations*100)   : 0,  color: '#eab308' },
            { icon: '🚨', label: 'No Helmet & No Vest', value: both,    pct: summary?.total_violations ? Math.round(both/summary.total_violations*100)     : 0,  color: '#a855f7' },
            { icon: '✅', label: 'Safe Workers',       value: compliant, pct: summary?.workers_detected ? Math.round(compliant/summary.workers_detected*100): 0,  color: '#22c55e' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span>{row.icon}</span>
                <span style={{ color: '#8b949e' }}>{row.label}</span>
              </div>
              <span style={{ color: row.color, fontWeight: '600' }}>
                {loading ? '…' : row.value} ({row.pct}%)
              </span>
            </div>
          ))}

          {/* Donut */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
            <div style={{ position: 'relative', width: '130px', height: '130px' }}>
              <PieChart width={130} height={130}>
                <Pie
                  data={donutData.length ? donutData : [{ value: 1, color: '#374151' }]}
                  cx={65} cy={65} innerRadius={40} outerRadius={60}
                  dataKey="value" paddingAngle={2}
                >
                  {(donutData.length ? donutData : [{ color: '#374151' }]).map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
              </PieChart>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#e6edf3' }}>
                  {(summary?.workers_detected || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '9px', color: '#8b949e' }}>Total Workers</div>
              </div>
            </div>
          </div>
        </div>

        {/* Violations Trend */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Violations Trend</div>
            <select
              value={trendGran}
              onChange={e => setTrendGran(e.target.value)}
              style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px' }}
            >
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '14px' }}>
            Daily trend of violations
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' }} />
              <Line type="monotone" dataKey="no_helmet" stroke="#f97316" dot={false} strokeWidth={2} name="No Helmet" />
              <Line type="monotone" dataKey="no_vest"   stroke="#eab308" dot={false} strokeWidth={2} name="No Vest" />
              <Line type="monotone" dataKey="both"      stroke="#a855f7" dot={false} strokeWidth={2} name="No Helmet & No Vest" />
            </LineChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
            {[['#f97316','No Helmet'],['#eab308','No Vest'],['#a855f7','No Helmet & No Vest']].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#8b949e' }}>
                <div style={{ width: '12px', height: '3px', background: c, borderRadius: '2px' }} />
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* Report Insights — Groq */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '14px' }}>
            <span style={{ fontSize: '16px' }}>✨</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Report Insights</div>
              <div style={{ fontSize: '10px', color: '#818cf8' }}>AI Generated Summary</div>
            </div>
          </div>

          {!groqReady ? (
            <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.6 }}>
              Add your <code style={{ color: '#6366f1' }}>GROQ_API_KEY</code> to{' '}
              <code style={{ color: '#6366f1' }}>backend/.env</code> to enable AI insights.
            </div>
          ) : insightLoad ? (
            <div style={{ fontSize: '12px', color: '#8b949e' }}>⏳ Generating AI insights…</div>
          ) : insights.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#8b949e' }}>Generate a report to see AI insights.</div>
          ) : (
            <>
              {insights.map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '10px', fontSize: '12px' }}>
                  <span style={{ color: '#22c55e', flexShrink: 0 }}>●</span>
                  <span style={{ color: '#8b949e', lineHeight: 1.5 }}>{ins}</span>
                </div>
              ))}
              <a
                href="/reports"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  marginTop: '14px', padding: '9px',
                  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#818cf8',
                  textDecoration: 'none',
                }}
              >📊 View Full AI Report</a>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom Grid: Reports Table + Preview ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>

        {/* Generated Reports Table */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Generated Reports</span>
            <select
              value={reportType}
              onChange={e => { setReportType(e.target.value); setPage(1) }}
              style={{ ...inputStyle, padding: '5px 10px', fontSize: '12px' }}
            >
              <option value="all">All Types</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="zone">Zone</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 160px 140px 130px 100px',
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            fontSize: '11px', color: '#8b949e', fontWeight: '600', textTransform: 'uppercase',
          }}>
            {['Report Name','Type','Date Range','Site / Zone','Generated On','Actions'].map(h => (
              <div key={h}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
              ⏳ Loading reports…
            </div>
          ) : reports.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>📄</div>
              No reports yet. Click <strong style={{ color: '#6366f1' }}>Generate Report</strong> above to create your first one!
            </div>
          ) : reports.map(r => {
            const isSelected = selected?.id === r.id
            return (
              <div
                key={r.id}
                onClick={() => handleSelectReport(r)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px 160px 140px 130px 100px',
                  padding: '13px 20px', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', alignItems: 'center',
                  background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                {/* Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>📄</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>{r.name}</span>
                </div>
                {/* Type badge */}
                <TypeBadge type={r.type} />
                {/* Date range */}
                <div style={{ fontSize: '12px', color: '#8b949e' }}>{r.date_range}</div>
                {/* Site/Zone */}
                <div style={{ fontSize: '12px', color: '#8b949e' }}>
                  {r.site === 'all' ? 'All Sites' : r.site} / {r.zone === 'all' ? 'All Zones' : r.zone}
                </div>
                {/* Generated on */}
                <div style={{ fontSize: '11px', color: '#8b949e' }}>
                  {r.generated_on ? new Date(r.generated_on).toLocaleString() : '—'}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); downloadReport(r.id, r.name) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '15px' }}
                    title="Download"
                  >⬇</button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteReport(r.id, r.name) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '15px' }}
                    title="Delete"
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
              Showing {reports.length ? (page-1)*5+1 : 0}–{Math.min(page*5, total)} of {total} reports
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

        {/* Report Preview */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <ReportPreview report={selected} onDownload={downloadReport} />
        </div>

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}