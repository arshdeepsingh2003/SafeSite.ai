// ============================================================
// SafeSite AI — Dashboard Page  (Phase 10 — LIVE data)
// File: frontend/src/components/pages/DashboardPage.jsx
// Matches the design: stat cards, live video, recent alerts,
// safety compliance donut, top violation zones, trend chart
// ============================================================

import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useAuth }          from '../../context/AuthContext'
import { useSocket }        from '../../context/SocketContext'
// import { useSoundSettings } from '../../context/SoundContext'  // FILE NOT FOUND
// import { playAlarm, playBeep } from '../../services/soundService'  // FILE NOT FOUND
import LiveAIInsight        from '../ui/LiveAIInsight'
import api   from '../../services/api'
import toast from 'react-hot-toast'

const DEMO_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, subColor }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: '16px', flex: 1,
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: '700', color, lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: '11px', color: subColor || '#8b949e', marginTop: '2px' }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Alert Row ─────────────────────────────────────────────────
function AlertRow({ alert }) {
  const severityColor = alert.severity === 'high' ? '#ef4444' : '#eab308'
  const icons = { no_helmet: '⛑️', no_vest: '🦺', no_helmet_and_no_vest: '🚨' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: '32px', height: '32px', flexShrink: 0,
        background: `${severityColor}18`, borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
      }}>{icons[alert.violation_type] || '⚠️'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '2px' }}>
          {alert.violation_type?.replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())}
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e' }}>
          {alert.zone} • {alert.camera}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#8b949e', flexShrink: 0 }}>
        {alert.created_at
          ? new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : ''}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function DashboardPage() {
  const { user }       = useAuth()
  const { isConnected, lastAlert } = useSocket()
  // const { soundEnabled } = useSoundSettings()  // FILE NOT FOUND

  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [isLive,      setIsLive]      = useState(false)
  const [muted,       setMuted]       = useState(true)
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)

  // ── Load dashboard stats ─────────────────────────────────
  useEffect(() => {
    let timer
    async function load() {
      try {
        const res = await api.get('/dashboard/stats')
        setStats(res.data)
      } catch { /* silently ignore — may not be seeded yet */ }
      finally { setLoading(false) }
    }
    load()
    timer = setInterval(load, 30000)  // refresh every 30s
    return () => clearInterval(timer)
  }, [])

  // ── Play sound when real-time alert arrives ──────────────
  // useEffect(() => {  // soundService missing
  //   if (!lastAlert || !soundEnabled) return
  //   if (lastAlert.severity === 'high') playAlarm()
  //   else playBeep()
  // }, [lastAlert, soundEnabled])

  // ── Load HLS stream ──────────────────────────────────────
  useEffect(() => {
    if (!videoRef.current) return
    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(DEMO_STREAM)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play().catch(() => {})
        setIsLive(true)
      })
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setIsLive(false) })
    }
    return () => { if (hlsRef.current) hlsRef.current.destroy() }
  }, [])

  // ── Derived display values ───────────────────────────────
  const s          = stats
  const total      = s?.stats?.total_workers      ?? 0
  const compliant  = s?.stats?.compliant          ?? 0
  const noHelmet   = s?.stats?.no_helmet          ?? 0
  const noVest     = s?.stats?.no_vest            ?? 0
  const bothMiss   = s?.stats?.both_missing ?? 0
  const compRate   = total > 0 ? Math.round((compliant / total) * 100) : 0

  const donutData  = [
    { name: 'Compliant',  value: compliant, color: '#22c55e' },
    { name: 'No Helmet',  value: noHelmet,  color: '#f97316' },
    { name: 'No Vest',    value: noVest,    color: '#eab308' },
    { name: 'Both',       value: bothMiss,  color: '#a855f7' },
  ].filter(d => d.value > 0)

  const topZones   = s?.top_zones   ?? []
  const trendData  = s?.trend_data  ?? []
  const recentAlerts = s?.recent_alerts ?? []

  return (
    <div>
      {/* ── Stat Cards Row ── */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <StatCard icon="👥" label="Total Workers Detected" value={loading ? '…' : total}
          sub={s?.stats?.change_pct ? `↑ ${s.stats.change_pct}% vs yesterday` : 'All workers'}
          color="#3b82f6" subColor="#22c55e" />
        <StatCard icon="✅" label="Compliant (Safe)" value={loading ? '…' : compliant}
          sub={`${compRate}% of total`} color="#22c55e" />
        <StatCard icon="⛑️"  label="No Helmet"  value={loading ? '…' : noHelmet}
          sub={total > 0 ? `${Math.round(noHelmet/total*100)}% of total` : ''}  color="#f97316" />
        <StatCard icon="🦺" label="No Vest"     value={loading ? '…' : noVest}
          sub={total > 0 ? `${Math.round(noVest/total*100)}% of total` : ''}    color="#eab308" />
        <StatCard icon="🚨" label="No Helmet & No Vest" value={loading ? '…' : bothMiss}
          sub={total > 0 ? `${Math.round(bothMiss/total*100)}% of total` : ''}  color="#a855f7" />
      </div>

      {/* ── Middle Row: Video + Recent Alerts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '16px' }}>

        {/* Live Video */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3' }}>Live Monitoring</span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                background: isLive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: isLive ? '#22c55e' : '#ef4444',
                border: `1px solid ${isLive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLive ? '#22c55e' : '#ef4444', animation: isLive ? 'pulse 1.5s infinite' : 'none' }} />
                {isLive ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <a href="/live-monitoring" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none' }}>Full Screen →</a>
          </div>

          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
            <video ref={videoRef} muted={muted} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            {isLive && (
              <div style={{ position: 'absolute', bottom: '8px', left: '10px', background: 'rgba(0,0,0,0.7)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', color: 'white' }}>
                {new Date().toLocaleString()}
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '5px 12px', background: '#3b82f6', borderRadius: '20px',
              fontSize: '12px', color: 'white', fontWeight: '600',
            }}>● Live</div>
            <button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#e6edf3', cursor: 'pointer', fontSize: '13px' }}>⏸</button>
            <button onClick={() => { setMuted(!muted); if(videoRef.current) videoRef.current.muted = !muted }}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', color: '#e6edf3', cursor: 'pointer', fontSize: '13px' }}>
              {muted ? '🔇' : '🔊'}
            </button>
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#8b949e' }}>
              {isConnected ? '🟢 Real-time Active' : '🔴 Real-time Offline'}
            </span>
          </div>
        </div>

        {/* Recent Alerts */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Recent Alerts</span>
            <a href="/alerts" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none' }}>View All</a>
          </div>

          {loading ? (
            <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Loading…</div>
          ) : recentAlerts.length === 0 ? (
            <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
              No alerts today — looking good!
            </div>
          ) : (
            recentAlerts.slice(0, 6).map((a, i) => <AlertRow key={i} alert={a} />)
          )}

          {/* Violations Trend in sidebar */}
          {trendData.length > 0 && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '10px' }}>
                Violations Trend
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={trendData}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#8b949e' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '6px', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="no_helmet" stroke="#f97316" dot={false} strokeWidth={2} name="No Helmet" />
                  <Line type="monotone" dataKey="no_vest"   stroke="#eab308" dot={false} strokeWidth={2} name="No Vest" />
                  <Line type="monotone" dataKey="both"      stroke="#a855f7" dot={false} strokeWidth={2} name="Both" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Compliance Donut + Zone Bars + AI Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>

        {/* Safety Compliance Donut */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>
            Safety Compliance
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative', width: '110px', height: '110px', flexShrink: 0 }}>
              <PieChart width={110} height={110}>
                <Pie data={donutData.length ? donutData : [{name:'No Data', value:1, color:'#374151'}]}
                  cx={55} cy={55} innerRadius={35} outerRadius={52} dataKey="value" paddingAngle={2}>
                  {(donutData.length ? donutData : [{color:'#374151'}]).map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
              </PieChart>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>{compRate}%</div>
                <div style={{ fontSize: '9px', color: '#8b949e' }}>Compliant</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {[
                { label: 'Compliant', value: compliant, color: '#22c55e' },
                { label: 'No Helmet', value: noHelmet,  color: '#f97316' },
                { label: 'No Vest',   value: noVest,    color: '#eab308' },
                { label: 'No Helmet & No Vest', value: bothMiss, color: '#a855f7' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                    <span style={{ color: '#8b949e' }}>{row.label}</span>
                  </div>
                  <span style={{ color: row.color, fontWeight: '600' }}>
                    {row.value} ({total > 0 ? Math.round(row.value/total*100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Violation Zones */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Top Violation Zones</span>
          </div>
          {topZones.length === 0 ? (
            <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              No zone data yet
            </div>
          ) : topZones.slice(0, 5).map((z, i) => {
            const maxVal = topZones[0]?.count || 1
            const barColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6']
            return (
              <div key={z.zone} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#e6edf3', fontWeight: '500' }}>{z.zone}</span>
                  <span style={{ fontSize: '13px', color: '#8b949e', fontWeight: '600' }}>{z.count}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${(z.count / maxVal) * 100}%`,
                    background: barColors[i % barColors.length], borderRadius: '3px',
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* AI Summary */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <LiveAIInsight autoLoad={true} compact={true} />
        </div>

      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  )
}