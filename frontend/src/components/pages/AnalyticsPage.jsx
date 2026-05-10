import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts'
import api from '../../services/api'
import toast from 'react-hot-toast'

function StatCard({ icon, label, value, change, color }) {
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
        {change !== undefined && change !== 0 && (
          <div style={{ fontSize: '11px', color: up ? '#22c55e' : '#ef4444', marginTop: '2px' }}>
            {up ? '↑' : '↓'} {Math.abs(change)}% vs last period
          </div>
        )}
      </div>
    </div>
  )
}

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']

export default function AnalyticsPage() {
  const [range, setRange] = useState('month')
  const [granularity, setGranularity] = useState('daily')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [trend, setTrend] = useState([])
  const [zoneData, setZoneData] = useState([])
  const [pieData, setPieData] = useState([])

  async function fetchAnalytics() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range, granularity })
      const [summaryRes, trendRes, zoneRes] = await Promise.all([
        api.get(`/analytics/summary?${params}`),
        api.get(`/analytics/trend?${params}`),
        api.get(`/analytics/zones?${params}`),
      ])
      setSummary(summaryRes.data || {})
      setTrend(trendRes.data || [])
      const zones = zoneRes.data || []
      setZoneData(zones)

      const noHelmet = summaryRes.data?.no_helmet_total ?? Math.round((summaryRes.data?.total_violations || 0) * 0.45)
      const noVest = summaryRes.data?.no_vest_total ?? Math.round((summaryRes.data?.total_violations || 0) * 0.35)
      const both = summaryRes.data?.both_total ?? (summaryRes.data?.high_risk_alerts || 0)
      const safe = Math.max(0, (summaryRes.data?.workers_detected || 0) - (summaryRes.data?.total_violations || 0))
      setPieData([
        { name: 'No Helmet', value: noHelmet, color: '#ef4444' },
        { name: 'No Vest', value: noVest, color: '#f97316' },
        { name: 'Both', value: both, color: '#a855f7' },
        { name: 'Safe', value: safe, color: '#22c55e' },
      ].filter(d => d.value > 0))
    } catch (err) {
      console.error('Failed to load analytics:', err)
      toast.error('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAnalytics() }, [range, granularity])

  const s = summary || {}
  const inputStyle = {
    padding: '8px 12px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: '7px',
    color: '#e6edf3', fontSize: '13px', outline: 'none',
  }

  const totalViolations = pieData.reduce((acc, d) => d.name !== 'Safe' ? acc + d.value : acc, 0)
  const complianceRate = s.workers_detected ? Math.round(((s.workers_detected - totalViolations) / s.workers_detected) * 100) : 0

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
          Dashboard › Analytics
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Advanced Analytics</h1>
      </div>

      <div style={{
        display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
        marginBottom: '20px', padding: '14px 16px',
        background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px',
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '5px' }}>Time Range</div>
          <select value={range} onChange={e => setRange(e.target.value)} style={inputStyle}>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '5px' }}>Granularity</div>
          <select value={granularity} onChange={e => setGranularity(e.target.value)} style={inputStyle}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <button
          onClick={fetchAnalytics}
          style={{
            padding: '9px 22px', marginLeft: 'auto',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', borderRadius: '8px',
            color: 'white', fontWeight: '700', fontSize: '13px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            alignSelf: 'flex-end',
          }}
        >🔄 Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <StatCard icon="👥" label="Workers Detected" value={loading ? '…' : (s.workers_detected ?? 0).toLocaleString()} color="#3b82f6" />
        <StatCard icon="⛑️" label="Total Violations" value={loading ? '…' : (s.total_violations ?? 0).toLocaleString()} color="#ef4444" change={s.change_total_violations} />
        <StatCard icon="✅" label="Compliance Rate" value={loading ? '…' : `${complianceRate}%`} color="#22c55e" change={s.change_compliance_rate} />
        <StatCard icon="🚨" label="High Risk Alerts" value={loading ? '…' : (s.high_risk_alerts ?? 0).toLocaleString()} color="#a855f7" change={s.change_high_risk_alerts} />
        <StatCard icon="📹" label="Active Cameras" value={loading ? '…' : (s.active_cameras ?? 0).toLocaleString()} color="#f97316" />
        <StatCard icon="📋" label="Reports Generated" value={loading ? '…' : (s.reports_generated ?? 0).toLocaleString()} color="#6366f1" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '4px' }}>
            Violations Trend
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '14px' }}>
            {range === 'week' ? 'Daily' : granularity === 'hourly' ? 'Hourly' : 'Periodic'} violation breakdown
          </div>

          {loading ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: '13px' }}>⏳ Loading trend data…</div>
          ) : trend.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: '13px' }}>No trend data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' }} />
                <Line type="monotone" dataKey="no_helmet" stroke="#ef4444" dot={false} strokeWidth={2} name="No Helmet" />
                <Line type="monotone" dataKey="no_vest" stroke="#f97316" dot={false} strokeWidth={2} name="No Vest" />
                <Line type="monotone" dataKey="both" stroke="#a855f7" dot={false} strokeWidth={2} name="Both" />
              </LineChart>
            </ResponsiveContainer>
          )}

          <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
            {[['#ef4444','No Helmet'],['#f97316','No Vest'],['#a855f7','Both']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#8b949e' }}>
                <div style={{ width: '12px', height: '3px', background: c, borderRadius: '2px' }} />{l}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '4px' }}>
            Violation Breakdown
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '14px' }}>
            Distribution of safety violations
          </div>

          {loading ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: '13px' }}>⏳ Loading…</div>
          ) : pieData.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: '13px' }}>No data available</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
              <PieChart width={180} height={180}>
                <Pie data={pieData} cx={90} cy={90} innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' }} />
              </PieChart>
              <div>
                {pieData.map(d => {
                  const total = pieData.reduce((a, b) => a + b.value, 0)
                  const pct = total ? Math.round((d.value / total) * 100) : 0
                  return (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: d.color, flexShrink: 0 }} />
                      <span style={{ color: '#8b949e', minWidth: '80px' }}>{d.name}</span>
                      <span style={{ color: '#e6edf3', fontWeight: '600' }}>{d.value.toLocaleString()}</span>
                      <span style={{ color: '#8b949e' }}>({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '4px' }}>
          Zone Comparison
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '14px' }}>
          Violations per zone across all sites
        </div>

        {loading ? (
          <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: '13px' }}>⏳ Loading zone data…</div>
        ) : zoneData.length === 0 ? (
          <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: '13px' }}>No zone data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={zoneData}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8b949e' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '8px', fontSize: '11px' }} />
              <Bar dataKey="violations" fill="#ef4444" radius={[4, 4, 0, 0]} name="Violations" />
              <Bar dataKey="compliant" fill="#22c55e" radius={[4, 4, 0, 0]} name="Compliant" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{
        padding: '16px 18px',
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '16px' }}>💡</span>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Analytics Insight</span>
        </div>
        <p style={{ fontSize: '13px', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>
          {loading
            ? 'Loading…'
            : totalViolations === 0
              ? 'No violations recorded in this period. Great safety compliance!'
              : `Over the selected period, there were ${totalViolations.toLocaleString()} total violations across ${zoneData.length} zone(s) with a compliance rate of ${complianceRate}%. ${s.high_risk_alerts ? `${s.high_risk_alerts} high-risk alerts were triggered.` : ''}`}
        </p>
      </div>
    </div>
  )
}
