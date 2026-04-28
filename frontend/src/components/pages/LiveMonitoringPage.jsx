import { useState, useRef, useEffect } from 'react'
import Hls from 'hls.js'
import LiveAIInsight from '../ui/LiveAIInsight'  // Phase 9 — live Groq insights
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

// ---- Mock data for display (will be replaced by real data in Phase 6) ----
const mockTrendData = Array.from({ length: 13 }, (_, i) => ({
  time: `${String(i * 2).padStart(2, '0')}:00`,
  helmet: Math.floor(Math.random() * 35) + 5,
  vest:   Math.floor(Math.random() * 25) + 3,
  both:   Math.floor(Math.random() * 12) + 1,
}))

const mockDetections = [
  { id: 1, type: 'No Helmet & No Vest', camera: 'Camera 1', zone: 'Zone A', time: '10:30:15 AM', color: '#ef4444' },
  { id: 2, type: 'No Helmet',           camera: 'Camera 1', zone: 'Zone A', time: '10:30:12 AM', color: '#f97316' },
  { id: 3, type: 'No Vest',             camera: 'Camera 1', zone: 'Zone B', time: '10:30:09 AM', color: '#eab308' },
  { id: 4, type: 'Safe',                camera: 'Camera 1', zone: 'Zone B', time: '10:30:07 AM', color: '#22c55e' },
  { id: 5, type: 'No Helmet & No Vest', camera: 'Camera 1', zone: 'Zone A', time: '10:30:04 AM', color: '#ef4444' },
]

const mockZoneData = [
  { name: 'Zone A', value: 42, color: '#ef4444' },
  { name: 'Zone B', value: 28, color: '#f97316' },
  { name: 'Zone C', value: 18, color: '#22c55e' },
  { name: 'Zone D', value: 12, color: '#3b82f6' },
]

const DEMO_STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

// ---- Sub-components ----

function StatCard({ value, label, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px' }}>
      <div style={{ fontSize: '24px', fontWeight: '700', color, marginBottom: '3px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#8b949e' }}>{label}</div>
    </div>
  )
}

function DetectionItem({ item }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 0', borderBottom: '1px solid var(--border)',
    }}>
      {/* Worker thumbnail */}
      <div style={{
        width: '44px', height: '44px', flexShrink: 0,
        background: `${item.color}18`,
        border: `1px solid ${item.color}40`,
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
      }}>
        {item.type === 'Safe' ? '✅' : '⚠️'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: item.color, marginBottom: '2px' }}>
          {item.type}
        </div>
        <div style={{ fontSize: '11px', color: '#8b949e' }}>
          {item.camera} • {item.zone}
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#8b949e', flexShrink: 0 }}>{item.time}</div>
    </div>
  )
}

// ---- Main Component ----
export default function LiveMonitoringPage() {
  const videoRef   = useRef(null)
  const hlsRef     = useRef(null)
  const [streamUrl, setStreamUrl]   = useState(DEMO_STREAM)
  const [inputUrl,  setInputUrl]    = useState('')
  const [isLive,    setIsLive]      = useState(false)
  const [muted,     setMuted]       = useState(true)
  const [hlsError,  setHlsError]    = useState(null)
  const [showUrlInput, setShowUrlInput] = useState(false)

  // Load and play HLS stream
  function loadStream(url) {
    setHlsError(null)

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!videoRef.current) return

    if (Hls.isSupported()) {
      // Most browsers (Chrome, Firefox, Edge)
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play().catch(() => {})
        setIsLive(true)
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setHlsError('Stream unavailable. Check the URL or try the demo stream.')
          setIsLive(false)
        }
      })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari — supports HLS natively
      videoRef.current.src = url
      videoRef.current.play().catch(() => {})
      setIsLive(true)
    } else {
      setHlsError('Your browser does not support HLS streams.')
    }
  }

  useEffect(() => {
    loadStream(streamUrl)
    return () => { if (hlsRef.current) hlsRef.current.destroy() }
  }, [])

  function handleLoadCustomUrl() {
    if (!inputUrl.trim()) return
    setStreamUrl(inputUrl.trim())
    loadStream(inputUrl.trim())
    setShowUrlInput(false)
    setInputUrl('')
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
          Dashboard &rsaquo; Live Monitoring
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Live Monitoring</h1>
      </div>

      {/* Main layout: video + right panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', marginBottom: '20px' }}>

        {/* ── Video Feed ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>

          {/* Camera header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#e6edf3' }}>Live Feed — Camera 1</span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 10px',
                background: isLive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                border: `1px solid ${isLive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                borderRadius: '12px', fontSize: '11px',
                color: isLive ? '#22c55e' : '#ef4444', fontWeight: '600',
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: isLive ? '#22c55e' : '#ef4444',
                  animation: isLive ? 'pulse 1.5s infinite' : 'none',
                }} />
                {isLive ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowUrlInput(!showUrlInput)}
                title="Change stream URL"
                style={{
                  padding: '6px 14px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: '7px',
                  color: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                }}
              >Change Camera ▾</button>
            </div>
          </div>

          {/* Custom URL input (toggleable) */}
          {showUrlInput && (
            <div style={{
              marginBottom: '12px', padding: '12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)', borderRadius: '8px',
              display: 'flex', gap: '8px',
            }}>
              <input
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Enter HLS stream URL (.m3u8)…"
                style={{
                  flex: 1, padding: '8px 12px',
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: '6px', color: '#e6edf3', fontSize: '13px', outline: 'none',
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadCustomUrl()}
              />
              <button onClick={handleLoadCustomUrl} style={{
                padding: '8px 16px', background: 'var(--accent-blue)',
                border: 'none', borderRadius: '6px', color: 'white',
                fontSize: '13px', cursor: 'pointer',
              }}>Load</button>
              <button onClick={() => { loadStream(DEMO_STREAM); setShowUrlInput(false) }} style={{
                padding: '8px 16px', background: 'var(--bg-hover)',
                border: '1px solid var(--border)', borderRadius: '6px', color: '#8b949e',
                fontSize: '12px', cursor: 'pointer',
              }}>Use Demo</button>
            </div>
          )}

          {/* Video player */}
          <div style={{
            position: 'relative', width: '100%', aspectRatio: '16/9',
            background: '#000', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px',
          }}>
            <video
              ref={videoRef}
              muted={muted}
              autoPlay
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />

            {/* Timestamp overlay */}
            {isLive && (
              <div style={{
                position: 'absolute', bottom: '12px', left: '12px',
                background: 'rgba(0,0,0,0.7)', borderRadius: '5px',
                padding: '4px 10px', fontSize: '12px', color: 'white',
              }}>
                {new Date().toLocaleString()}
              </div>
            )}

            {/* Error overlay */}
            {hlsError && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#ef4444', fontSize: '14px', textAlign: 'center', padding: '20px',
              }}>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>📡</div>
                {hlsError}
                <button
                  onClick={() => loadStream(DEMO_STREAM)}
                  style={{
                    marginTop: '14px', padding: '8px 20px',
                    background: 'var(--accent-blue)', border: 'none',
                    borderRadius: '6px', color: 'white', cursor: 'pointer',
                  }}
                >Load Demo Stream</button>
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', background: 'var(--accent-blue)',
              borderRadius: '20px', fontSize: '12px', color: 'white', fontWeight: '600',
            }}>
              ● Live
            </div>
            <button style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '6px 10px', color: '#e6edf3', cursor: 'pointer',
            }} onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
              ⏸
            </button>
            <button
              onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted }}
              style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '6px 10px', color: '#e6edf3', cursor: 'pointer',
              }}
            >{muted ? '🔇' : '🔊'}</button>

            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#8b949e' }}>
              Detection Confidence: <strong style={{ color: '#e6edf3' }}>High (0.85)</strong>
            </span>
            <span style={{ fontSize: '12px', color: '#8b949e' }}>
              Quality: <strong style={{ color: '#e6edf3' }}>1080p HD</strong>
            </span>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Real-time Detections */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Real-time Detections</span>
              <span style={{ fontSize: '12px', color: '#3b82f6', cursor: 'pointer' }}>View All</span>
            </div>
            {mockDetections.map(d => <DetectionItem key={d.id} item={d} />)}
          </div>

          {/* Live Summary */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px' }}>Live Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <StatCard value="128" label="Total Workers" color="#3b82f6" />
              <StatCard value="85"  label="Compliant"     color="#22c55e" />
              <StatCard value="24"  label="No Helmet"     color="#f97316" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <StatCard value="13"    label="No Vest"          color="#eab308" />
              <StatCard value="6"     label="No Helmet+Vest"   color="#ef4444" />
              <StatCard value="66.4%" label="Compliance"        color="#a855f7" />
            </div>
          </div>

          {/* AI Safety Insight — powered by Groq (Phase 9) */}
          <LiveAIInsight autoLoad={true} refreshEvery={120} />
        </div>
      </div>

      {/* Bottom charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Violation Trend Chart */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>
            Violation Trend (Today)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={mockTrendData}>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#e6edf3' }}
              />
              <Line type="monotone" dataKey="helmet" stroke="#f97316" dot={false} strokeWidth={2} name="No Helmet" />
              <Line type="monotone" dataKey="vest"   stroke="#eab308" dot={false} strokeWidth={2} name="No Vest" />
              <Line type="monotone" dataKey="both"   stroke="#a855f7" dot={false} strokeWidth={2} name="No Helmet & No Vest" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            {[['#f97316','No Helmet'],['#eab308','No Vest'],['#a855f7','No Helmet & No Vest']].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#8b949e' }}>
                <div style={{ width: '12px', height: '3px', background: c, borderRadius: '2px' }} />
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* Zone Overview Donut */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>
            Zone Overview
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <PieChart width={150} height={150}>
              <Pie data={mockZoneData} cx={70} cy={70} innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                {mockZoneData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
            </PieChart>
            <div style={{ flex: 1 }}>
              {mockZoneData.map(z => (
                <div key={z.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{ width: '10px', height: '10px', background: z.color, borderRadius: '50%' }} />
                    <span style={{ fontSize: '12px', color: '#e6edf3' }}>{z.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#8b949e' }}>{z.value} ({z.value}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pulse animation for LIVE dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}