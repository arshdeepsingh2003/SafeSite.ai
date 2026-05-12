import { useState, useRef, useEffect } from 'react'
import Hls from 'hls.js'
import LiveAIInsight from '../ui/LiveAIInsight'  // Phase 9 — live Groq insights
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie } from 'recharts'
import { proxyHlsUrl } from '../../services/hlsProxy'

// ---- Real-time data is fetched from backend API ----

// ---- Sub-components ----

function StatCard({ value, label, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px' }}>
      <div style={{ fontSize: '24px', fontWeight: '700', color, marginBottom: '3px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#8b949e' }}>{label}</div>
    </div>
  )
}

// ---- Main Component ----
export default function LiveMonitoringPage() {
  const videoRef   = useRef(null)
  const hlsRef     = useRef(null)
  const [streamUrl, setStreamUrl]   = useState('')
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
    const proxied = proxyHlsUrl(inputUrl.trim())
    setStreamUrl(proxied)
    loadStream(proxied)
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
              >Add live stream link ▾</button>
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
            <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              No detections yet. Connect a live stream to start monitoring.
            </div>
          </div>

          {/* Live Summary */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px' }}>Live Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <StatCard value="--" label="Total Workers" color="#3b82f6" />
              <StatCard value="--"  label="Compliant"     color="#22c55e" />
              <StatCard value="--"  label="No Helmet"     color="#f97316" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <StatCard value="--"    label="No Vest"          color="#eab308" />
              <StatCard value="--"     label="No Helmet+Vest"   color="#ef4444" />
              <StatCard value="--" label="Compliance"        color="#a855f7" />
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
            <LineChart data={[]}>
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
              <Pie data={[]} cx={70} cy={70} innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                
              </Pie>
            </PieChart>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '10px' }}>
                No zone data available yet.
              </div>
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