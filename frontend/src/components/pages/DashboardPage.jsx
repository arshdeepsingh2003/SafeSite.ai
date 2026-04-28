// ============================================================
// SafeSite AI — Dashboard Page  (Phase 10 — Full Integration)
// File: frontend/src/components/pages/DashboardPage.jsx
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { useAuth }           from '../../context/AuthContext'
import { useSocket }         from '../../context/SocketContext'
import { useSoundSettings }  from '../../context/SoundContext'
import { playAlarm, playBeep } from '../../services/soundService'
import LiveAIInsight         from '../ui/LiveAIInsight'
import Hls from 'hls.js'
import api  from '../../services/api'
import toast from 'react-hot-toast'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

const DEMO_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
const VIOLATION_COLORS = {
  no_helmet:              '#f97316',
  no_vest:                '#eab308',
  no_helmet_and_no_vest:  '#a855f7',
  compliant:              '#22c55e',
}

// ── Stat Card ─────────────────────────────────────────────────
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

// ── Recent Alert Row ──────────────────────────────────────────
function AlertRow({ alert }) {
  const sev = alert.severity
  const col = sev === 'high' ? '#ef4444' : '#eab308'
  const label = alert.violation_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown'
  const time  = alert.created_at
    ? new Date(alert.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
    : '—'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: '32px', height: '32px', flexShrink: 0,
        background: `${col}18`, border: `1px solid ${col}40`,
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
      }}>⚠️</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: col }}>{label}</div>
        <div style={{ fontSize: '11px', color: '#8b949e' }}>
          {alert.zone} • {alert.camera}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#8b949e', flexShrink: 0 }}>{time}</div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function DashboardPage() {
  const { user }            = useAuth()
  const { isConnected }     = useSocket()
  const { soundEnabled }    = useSoundSettings()
  const videoRef            = useRef(null)
  const hlsRef              = useRef(null)

  const [stats,          setStats]          = useState(null)
  const [recentAlerts,   setRecentAlerts]   = useState([])
  const [trend,          setTrend]          = useState([])
  const [topZones,       setTopZones]       = useState([])
  const [complianceData, setComplianceData] = useState([])
  const [loading,        setLoading]        = useState(true)
  const [isLive,         setIsLive]         = useState(false)
  const [muted,          setMuted]          = useState(true)
  const [firing,         setFiring]         = useState(false)

  // ── Fetch dashboard stats ──────────────────────────────────
  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 30000)
    return () => clearInterval(id)
  }, [])

  async function loadStats() {
    try {
      const res = await api.get('/dashboard/stats')
      const d   = res.data
      setStats(d.stats)
      setRecentAlerts(d.recent_alerts || [])
      setTrend(d.trend || [])
      setTopZones(d.top_zones || [])
      setComplianceData(d.compliance_data || [])
    } catch (err) {
      console.error('Dashboard stats failed:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── HLS video ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef.current) return
    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(DEMO_STREAM)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(() => {})
        setIsLive(true)
      })
    }
    return () => hlsRef.current?.destroy()
  }, [])

  async function fireTestAlert() {
    setFiring(true)
    try {
      await api.post('/test/fire-alert')
    } catch { toast.error('Could not fire alert') }
    finally { setFiring(false) }
  }

  const compRate = stats?.compliance_rate ?? 0
  const maxZone  = topZones[0]?.count || 1

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
        <StatCard icon="⛑️"  label="No Helmet"
          value={loading ? '—' : stats?.no_helmet ?? 0}
          sub={stats ? `${((stats.no_helmet/Math.max(stats.total_workers,1))*100).toFixed(1)}% of total` : ''}
          subColor="#f97316" />
        <StatCard icon="🦺" label="No Vest"
          value={loading ? '—' : stats?.no_vest ?? 0}
          sub={stats ? `${((stats.no_vest/Math.max(stats.total_workers,1))*100).toFixed(1)}% of total` : ''}
          subColor="#eab308" />
        <StatCard icon="🚫" label="No Helmet & No Vest"
          value={loading ? '—' : stats?.both_missing ?? 0}
          sub={stats ? `${((stats.both_missing/Math.max(stats.total_workers,1))*100).toFixed(1)}% of total` : ''}
          subColor="#a855f7" />
      </div>

      {/* ── Main row: Video + Right panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '16px' }}>

        {/* ── Live Monitoring feed ── */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>
              Live Monitoring
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '3px 10px',
              background: isLive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${isLive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              borderRadius: '12px', fontSize: '11px', fontWeight: '700',
              color: isLive ? '#22c55e' : '#8b949e',
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: isLive ? '#22c55e' : '#8b949e',
                animation: isLive ? 'pulse 1.5s infinite' : 'none',
              }}/>
              {isLive ? 'LIVE' : 'LOADING'}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              <IconBtn title="Screenshot" icon="📷" />
              <IconBtn title="Mute/Unmute" icon={muted ? '🔇' : '🔊'}
                onClick={() => { setMuted(!muted); if(videoRef.current) videoRef.current.muted = !muted }} />
              <a href="/live-monitoring" style={{ textDecoration: 'none' }}>
                <IconBtn title="Full screen" icon="⛶" />
              </a>
            </div>
          </div>

          {/* Video */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>
            <video ref={videoRef} muted={muted} autoPlay playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            {isLive && (
              <div style={{
                position: 'absolute', bottom: '10px', left: '10px',
                background: 'rgba(0,0,0,0.7)', borderRadius: '5px',
                padding: '3px 8px', fontSize: '11px', color: 'white',
              }}>
                {new Date().toLocaleString()}
              </div>
            )}
          </div>

          {/* Video controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px' }}>
            <span style={{
              padding: '4px 12px', background: 'var(--accent-blue)',
              borderRadius: '12px', fontSize: '11px', color: 'white', fontWeight: '700',
            }}>● Live</span>
            <button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
              style={ctrlBtn}>⏸</button>
            <button onClick={() => { setMuted(!muted); if(videoRef.current) videoRef.current.muted = !muted }}
              style={ctrlBtn}>{muted ? '🔇' : '🔊'}</button>
            <button onClick={fireTestAlert} disabled={firing || !isConnected}
              style={{ ...ctrlBtn, marginLeft: 'auto', padding: '4px 12px', fontSize: '11px',
                background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)' }}>
              {firing ? '⏳' : '🚨 Test Alert'}
            </button>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Recent Alerts */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '16px', flex: 1,
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <span style={{ fontSize:'13px', fontWeight:'600', color:'#e6edf3' }}>Recent Alerts</span>
              <a href="/alerts" style={{ fontSize:'11px', color:'#3b82f6', textDecoration:'none' }}>View All</a>
            </div>
            {recentAlerts.length === 0
              ? <div style={{ fontSize:'12px', color:'#8b949e', textAlign:'center', padding:'20px 0' }}>
                  No alerts today — site is compliant! ✅
                </div>
              : recentAlerts.slice(0,6).map((a,i) => <AlertRow key={i} alert={a} />)
            }
          </div>

          {/* Violations Trend mini chart */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '16px',
          }}>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#e6edf3', marginBottom:'12px' }}>
              Violations Trend
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={trend.filter((_,i) => i % 2 === 0)}>
                <XAxis dataKey="time" tick={{ fontSize:9, fill:'#8b949e' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #30363d', borderRadius:'6px', fontSize:'11px' }} />
                <Line type="monotone" dataKey="no_helmet" stroke="#f97316" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="no_vest"   stroke="#eab308" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="both"      stroke="#a855f7" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Bottom row: Compliance donut + Top zones + AI Insight ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 300px', gap: '16px' }}>

        {/* Safety Compliance donut */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '18px',
        }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:'#e6edf3', marginBottom:'14px' }}>
            Safety Compliance
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ position:'relative', width:'100px', height:'100px', flexShrink:0 }}>
              <PieChart width={100} height={100}>
                <Pie data={complianceData.length ? complianceData : [{label:'No data',value:1,color:'#30363d'}]}
                  cx={46} cy={46} innerRadius={28} outerRadius={46}
                  dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
                  {(complianceData.length ? complianceData : [{color:'#30363d'}])
                    .map((e,i) => <Cell key={i} fill={e.color} />)}
                </Pie>
              </PieChart>
              <div style={{
                position:'absolute', inset:0, display:'flex',
                alignItems:'center', justifyContent:'center',
                flexDirection:'column',
              }}>
                <div style={{ fontSize:'16px', fontWeight:'700', color:'#e6edf3', lineHeight:1 }}>
                  {compRate}%
                </div>
                <div style={{ fontSize:'9px', color:'#8b949e' }}>Compliant</div>
              </div>
            </div>
            <div style={{ flex:1 }}>
              {complianceData.map((d,i) => (
                <div key={i} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  marginBottom:'6px', fontSize:'11px',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:d.color }} />
                    <span style={{ color:'#8b949e' }}>{d.label}</span>
                  </div>
                  <span style={{ color:'#e6edf3', fontWeight:'600' }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Violation Zones */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '18px',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <span style={{ fontSize:'13px', fontWeight:'600', color:'#e6edf3' }}>Top Violation Zones</span>
            <span style={{ fontSize:'11px', color:'#8b949e' }}>Today</span>
          </div>
          {topZones.length === 0
            ? <div style={{ fontSize:'12px', color:'#8b949e', textAlign:'center', padding:'20px 0' }}>
                No violations today ✅
              </div>
            : topZones.map((z, i) => {
              const pct = Math.round((z.count / maxZone) * 100)
              const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6']
              return (
                <div key={i} style={{ marginBottom:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                    <span style={{ fontSize:'12px', color:'#e6edf3', fontWeight:'500' }}>{z.zone}</span>
                    <span style={{ fontSize:'12px', fontWeight:'700', color:'#e6edf3' }}>{z.count}</span>
                  </div>
                  <div style={{ height:'6px', background:'var(--bg-primary)', borderRadius:'3px', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', width:`${pct}%`,
                      background:colors[i % colors.length], borderRadius:'3px', transition:'width 0.5s',
                    }} />
                  </div>
                </div>
              )
            })
          }
        </div>

        {/* AI Summary */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '18px', display:'flex', flexDirection:'column',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px' }}>
            <span style={{ fontSize:'20px' }}>✨</span>
            <span style={{ fontSize:'13px', fontWeight:'600', color:'#e6edf3' }}>AI Summary</span>
            <span style={{
              padding:'2px 7px', background:'rgba(99,102,241,0.2)',
              border:'1px solid rgba(99,102,241,0.4)',
              borderRadius:'10px', fontSize:'10px', color:'#818cf8', fontWeight:'700',
            }}>Powered by LLM</span>
          </div>
          <div style={{ flex:1 }}>
            <LiveAIInsight compact={true} autoLoad={true} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}

const ctrlBtn = {
  background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
  color: '#e6edf3', fontSize: '14px',
}

function IconBtn({ icon, title, onClick }) {
  return (
    <button onClick={onClick} title={title} style={{
      background:'var(--bg-primary)', border:'1px solid var(--border)',
      borderRadius:'6px', padding:'5px 8px', cursor:'pointer',
      color:'#8b949e', fontSize:'14px', lineHeight:1,
    }}>{icon}</button>
  )
}