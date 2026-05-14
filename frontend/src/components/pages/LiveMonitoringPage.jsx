import { useState, useRef, useEffect } from 'react'
import Hls from 'hls.js'
import LiveAIInsight from '../ui/LiveAIInsight'
import { useStream } from '../../context/StreamContext'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { proxyHlsUrl } from '../../services/hlsProxy'
import api from '../../services/api'

const VIOLATION_COLORS = {
  no_helmet: '#f97316',
  no_vest: '#eab308',
  no_helmet_and_no_vest: '#ef4444',
  compliant: '#22c55e',
}

function StatCard({ value, label, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px' }}>
      <div style={{ fontSize: '24px', fontWeight: '700', color, marginBottom: '3px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#8b949e' }}>{label}</div>
    </div>
  )
}

function DetectionItem({ det }) {
  const vtype = det.violation || 'unknown'
  const color = VIOLATION_COLORS[vtype] || '#8b949e'
  const label = det.label || vtype.replace(/_/g, ' ')
  const conf = det.confidence ? Math.round(det.confidence * 100) : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 10px',
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: '8px', marginBottom: '6px',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: color, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3' }}>
          Worker #{det.worker_id || '?'}
        </div>
        <div style={{ fontSize: '11px', color }}>
          {label}
        </div>
      </div>
      {conf !== null && (
        <span style={{
          fontSize: '11px', fontWeight: '700', color, flexShrink: 0,
        }}>
          {conf}%
        </span>
      )}
    </div>
  )
}

const TREND_COLORS = ['#f97316', '#eab308', '#ef4444']
const TREND_NAMES = ['No Helmet', 'No Vest', 'No Helmet & No Vest']
const CHART_COLORS = ['#22c55e', '#f97316', '#eab308', '#ef4444']

function LiveMonitoringPage() {
  const {
    liveSummary, currentDetections, detectionHistory,
    isAnalyzing, analysisError, streamSessionId,
    detectionsRef, streamUrl, setStreamUrl, originalUrl, setOriginalUrl,
    setCurrentDetections, setLiveSummary, setDetectionHistory,
    startAnalysis, stopAnalysis, resetDetections,
    setAnalysisError, setIsAnalyzing, setStreamSessionId,
  } = useStream()

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const hlsRef = useRef(null)
  const animRef = useRef(null)

  const [inputUrl, setInputUrl] = useState('')
  const [isLive, setIsLive] = useState(false)
  const [muted, setMuted] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hlsError, setHlsError] = useState(null)
  const [showUrlInput, setShowUrlInput] = useState(false)

  const complianceRateVal = liveSummary.complianceRate !== '--'
    ? `${liveSummary.complianceRate}%`
    : '--'

  function syncCanvasSize() {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const rect = video.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width
      canvas.height = rect.height
    }
  }

  function autoStartAnalysis() {
    if (!originalUrl || isAnalyzing) return
    startAnalysis(originalUrl)
  }

  function loadStream(url) {
    setHlsError(null)

    if (!url) return

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!videoRef.current) return

    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current.play().catch(() => {})
        setIsLive(true)
        setTimeout(syncCanvasSize, 100)
        setTimeout(autoStartAnalysis, 500)
      })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setHlsError('Stream unavailable. Check the URL or try the demo stream.')
          setIsLive(false)
        }
      })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = url
      videoRef.current.play().catch(() => {})
      setIsLive(true)
      setTimeout(syncCanvasSize, 100)
      setTimeout(autoStartAnalysis, 500)
    } else {
      setHlsError('Your browser does not support HLS streams.')
    }
  }

  useEffect(() => {
    loadStream(streamUrl)
    return () => {
      if (hlsRef.current) hlsRef.current.destroy()
    }
  }, [streamUrl])

  useEffect(() => {
    syncCanvasSize()
    window.addEventListener('resize', syncCanvasSize)
    const video = videoRef.current
    if (video) {
      video.addEventListener('loadedmetadata', syncCanvasSize)
      video.addEventListener('play', syncCanvasSize)
      video.addEventListener('playing', syncCanvasSize)
    }
    return () => {
      window.removeEventListener('resize', syncCanvasSize)
      if (video) {
        video.removeEventListener('loadedmetadata', syncCanvasSize)
        video.removeEventListener('play', syncCanvasSize)
        video.removeEventListener('playing', syncCanvasSize)
      }
    }
  }, [isLive])

  function handleLoadCustomUrl() {
    if (!inputUrl.trim()) return
    setOriginalUrl(inputUrl.trim())
    const proxied = proxyHlsUrl(inputUrl.trim())
    setStreamUrl(proxied)
    loadStream(proxied)
    setShowUrlInput(false)
    setInputUrl('')
  }



  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const dets = detectionsRef.current
      const w = canvas.width
      const h = canvas.height

      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.strokeRect(2, 2, w - 4, h - 4)

      for (const det of dets) {
        const bbox = det.bbox
        if (!bbox || bbox.length < 4) continue

        const x1 = bbox[0] * w
        const y1 = bbox[1] * h
        const bw = (bbox[2] - bbox[0]) * w
        const bh = (bbox[3] - bbox[1]) * h
        const color = det.color_hex || '#ef4444'
        const label = det.label || det.violation || 'unknown'
        const conf = det.confidence ? ` ${Math.round(det.confidence * 100)}%` : ''

        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.strokeRect(x1, y1, bw, bh)

        ctx.fillStyle = `${color}20`
        ctx.fillRect(x1, y1, bw, bh)

        const text = `${label}${conf}`
        ctx.font = 'bold 12px monospace'
        const tw = ctx.measureText(text).width
        const lh = 20

        ctx.fillStyle = color
        ctx.fillRect(x1, y1 - lh, tw + 8, lh)

        ctx.fillStyle = '#ffffff'
        ctx.fillText(text, x1 + 4, y1 - 5)
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isAnalyzing || !streamSessionId) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/ai/stream/status')
        const sessions = res.data.active_sessions || []
        const mine = sessions.find(s => s.session_id === streamSessionId)
        if (mine) {
          if (!mine.running) {
            setAnalysisError(`Analysis process exited (code: ${mine.returncode})`)
            setIsAnalyzing(false)
            setStreamSessionId(null)
          }
        } else {
          setAnalysisError('Analysis session not found')
          setIsAnalyzing(false)
          setStreamSessionId(null)
        }
      } catch {
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [isAnalyzing, streamSessionId])

  function handleStopAnalysis() {
    stopAnalysis()
  }

  async function handleTestDetections() {
    try {
      await api.post('/ai/stream/test-detections')
    } catch (err) {
      console.error('Test detections failed:', err)
    }
  }

  function handleTestBoxes() {
    const testDets = [
      { worker_id: 1, label: 'No Helmet', violation: 'no_helmet', bbox: [0.1, 0.15, 0.3, 0.45], color_hex: '#f97316', confidence: 0.92 },
      { worker_id: 2, label: 'No Vest', violation: 'no_vest', bbox: [0.5, 0.2, 0.72, 0.5], color_hex: '#eab308', confidence: 0.88 },
      { worker_id: 3, label: 'No Helmet & No Vest', violation: 'no_helmet_and_no_vest', bbox: [0.25, 0.55, 0.48, 0.85], color_hex: '#ef4444', confidence: 0.95 },
    ]
    detectionsRef.current = testDets
    setCurrentDetections(testDets)
    setLiveSummary({ totalWorkers: 3, compliant: 0, noHelmet: 1, noVest: 1, noHelmetVest: 1, complianceRate: 0 })
    setDetectionHistory(prev => [...prev.slice(-57), ...[1,2,3].map(i => ({
      time: new Date(Date.now() - (3-i)*1000).toLocaleTimeString(),
      helmet: 1, vest: 1, both: 1,
    }))])
  }

  const zonePieData = [
    { name: 'Compliant', value: Math.max(0, liveSummary.compliant !== '--' ? liveSummary.compliant : 0) },
    { name: 'No Helmet', value: Math.max(0, liveSummary.noHelmet !== '--' ? liveSummary.noHelmet : 0) },
    { name: 'No Vest', value: Math.max(0, liveSummary.noVest !== '--' ? liveSummary.noVest : 0) },
    { name: 'Both', value: Math.max(0, liveSummary.noHelmetVest !== '--' ? liveSummary.noHelmetVest : 0) },
  ].filter(d => d.value > 0)

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>
          Dashboard &rsaquo; Live Monitoring
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Live Monitoring</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', marginBottom: '20px' }}>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>

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

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {isLive && isAnalyzing && (
                <button
                  onClick={handleStopAnalysis}
                  title="Stop AI detection"
                  style={{
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    border: 'none', borderRadius: '7px',
                    color: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                  }}
                >Stop Analysis</button>
              )}
              {isAnalyzing && (
                <button
                  onClick={handleTestDetections}
                  title="Send test detections from backend"
                  style={{
                    padding: '6px 10px',
                    background: 'rgba(99,102,241,0.2)',
                    border: '1px solid rgba(99,102,241,0.4)',
                    borderRadius: '7px',
                    color: '#818cf8', fontSize: '10px', cursor: 'pointer',
                  }}
                >Test Backend</button>
              )}
              <button
                onClick={handleTestBoxes}
                title="Show test bounding boxes"
                style={{
                  padding: '6px 10px',
                  background: 'rgba(251,191,36,0.15)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  borderRadius: '7px',
                  color: '#fbbf24', fontSize: '10px', cursor: 'pointer',
                }}
              >Test Boxes</button>
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
                placeholder="Enter HLS stream URL (.m3u8)..."
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

          <div style={{
            position: 'relative', width: '100%', aspectRatio: '16/9',
            background: '#000', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px',
          }}>
            <video
              ref={videoRef}
              muted={muted}
              autoPlay
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%',
                pointerEvents: 'none',
              }}
            />

            {isAnalyzing && !analysisError && (
              <div style={{
                position: 'absolute', top: '10px', right: '10px',
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px',
                background: 'rgba(239,68,68,0.85)',
                borderRadius: '6px',
                fontSize: '11px', color: 'white', fontWeight: '600',
              }}>
                <span style={{
                  width: '5px', height: '5px', borderRadius: '50%',
                  background: '#fff', animation: 'pulse 1s infinite',
                }} />
                AI DETECTING
              </div>
            )}

            {analysisError && (
              <div style={{
                position: 'absolute', top: '10px', right: '10px',
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px',
                background: 'rgba(239,68,68,0.85)',
                borderRadius: '6px',
                fontSize: '11px', color: 'white', fontWeight: '600',
              }}>
                ⚠️ {analysisError}
              </div>
            )}

            {isLive && (
              <div style={{
                position: 'absolute', bottom: '12px', left: '12px',
                background: 'rgba(0,0,0,0.7)', borderRadius: '5px',
                padding: '4px 10px', fontSize: '12px', color: 'white',
              }}>
                {new Date().toLocaleString()}
              </div>
            )}

            {isAnalyzing && !analysisError && liveSummary.totalWorkers !== '--' && (
              <div style={{
                position: 'absolute', bottom: '12px', right: '12px',
                background: 'rgba(0,0,0,0.75)', borderRadius: '6px',
                padding: '6px 10px', fontSize: '11px', color: 'white',
                textAlign: 'right',
              }}>
                <div>Workers: <strong>{liveSummary.totalWorkers}</strong></div>
                <div>Violations: <strong style={{ color: '#ef4444' }}>
                  {(liveSummary.noHelmet !== '--' ? liveSummary.noHelmet : 0) +
                   (liveSummary.noVest !== '--' ? liveSummary.noVest : 0) +
                   (liveSummary.noHelmetVest !== '--' ? liveSummary.noHelmetVest : 0)}
                </strong></div>
                <div>Compliance: <strong style={{ color: '#22c55e' }}>{complianceRateVal}</strong></div>
              </div>
            )}

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

            {!streamUrl && !hlsError && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#8b949e', fontSize: '14px', textAlign: 'center', padding: '20px',
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.4 }}>📹</div>
                <div style={{ fontWeight: '600', color: '#8b949e', marginBottom: '6px' }}>No Stream Connected</div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  Click <strong style={{ color: '#6366f1' }}>Add live stream link</strong> above to enter an HLS stream URL.
                </div>
              </div>
            )}
          </div>

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
              {isPlaying ? '⏸' : '▶️'}
            </button>
            <button
              onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted }}
              style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: '6px', padding: '6px 10px', color: '#e6edf3', cursor: 'pointer',
              }}
            >{muted ? '🔇' : '🔊'}</button>

            {isAnalyzing && !analysisError && (
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#22c55e' }}>
                <span style={{ animation: 'pulse 1s infinite' }}>●</span> Analyzing live stream
              </span>
            )}
            {analysisError && (
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#ef4444' }}>
                ⚠️ Analysis failed
              </span>
            )}
            <span style={{ marginLeft: (isAnalyzing || analysisError) ? '0' : 'auto', fontSize: '12px', color: '#8b949e' }}>
              Detection Confidence: <strong style={{ color: '#e6edf3' }}>High (0.85)</strong>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3' }}>Real-time Detections</span>
              <span style={{ fontSize: '11px', color: '#8b949e' }}>
                {currentDetections.length > 0 ? `${currentDetections.length} objects` : ''}
              </span>
            </div>
            {currentDetections.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {currentDetections.map((det, i) => (
                  <DetectionItem key={`${det.worker_id || i}-${i}`} det={det} />
                ))}
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                {isAnalyzing && !analysisError
                  ? 'Waiting for detections...'
                  : 'Start AI analysis to see detections.'}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px' }}>Live Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <StatCard value={liveSummary.totalWorkers} label="Total Workers" color="#3b82f6" />
              <StatCard value={liveSummary.compliant}     label="Compliant"     color="#22c55e" />
              <StatCard value={liveSummary.noHelmet}      label="No Helmet"     color="#f97316" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <StatCard value={liveSummary.noVest}        label="No Vest"          color="#eab308" />
              <StatCard value={liveSummary.noHelmetVest}   label="No Helmet+Vest"   color="#ef4444" />
              <StatCard value={complianceRateVal}          label="Compliance"       color="#a855f7" />
            </div>
          </div>

        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <LiveAIInsight autoLoad={true} refreshEvery={120} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>
            Violation Trend (Live)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={detectionHistory.length > 0 ? detectionHistory : [{ time: '--', helmet: 0, vest: 0, both: 0 }]}>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8b949e' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid #30363d', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#e6edf3' }}
              />
              <Line type="monotone" dataKey="helmet" stroke="#f97316" dot={false} strokeWidth={2} name="No Helmet" isAnimationActive={false} />
              <Line type="monotone" dataKey="vest"   stroke="#eab308" dot={false} strokeWidth={2} name="No Vest" isAnimationActive={false} />
              <Line type="monotone" dataKey="both"   stroke="#ef4444" dot={false} strokeWidth={2} name="No Helmet & No Vest" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            {TREND_COLORS.map((c, i) => (
              <div key={TREND_NAMES[i]} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#8b949e' }}>
                <div style={{ width: '12px', height: '3px', background: c, borderRadius: '2px' }} />
                {TREND_NAMES[i]}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e6edf3', marginBottom: '16px' }}>
            Zone Overview
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <PieChart width={150} height={150}>
              <Pie
                data={zonePieData.length > 0 ? zonePieData : [{ name: 'No Data', value: 1 }]}
                cx={70} cy={70} innerRadius={40} outerRadius={65}
                dataKey="value" paddingAngle={2}
              >
                {zonePieData.length > 0
                  ? zonePieData.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i] || '#8b949e'} />
                    ))
                  : <Cell fill="#30363d" />
                }
              </Pie>
            </PieChart>
            <div style={{ flex: 1 }}>
              {zonePieData.length > 0 ? (
                <div>
                  {zonePieData.map((d, i) => (
                    <div key={d.name} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      marginBottom: '6px', fontSize: '12px',
                    }}>
                      <div style={{
                        width: '10px', height: '10px', borderRadius: '3px',
                        background: CHART_COLORS[i] || '#8b949e', flexShrink: 0,
                      }} />
                      <span style={{ color: '#8b949e', flex: 1 }}>{d.name}</span>
                      <span style={{ color: '#e6edf3', fontWeight: '600' }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '10px' }}>
                  No zone data available yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', fontSize: '11px', color: '#8b949e', textAlign: 'center' }}>
        <strong>Debug:</strong> Click &quot;Test Boxes&quot; to inject sample bounding boxes locally.{' '}
        Click &quot;Test Backend&quot; (with analysis running) to send detections from the backend.{' '}
        Canvas: {canvasRef.current ? `${canvasRef.current.width}x${canvasRef.current.height}` : 'not mounted'}
        {currentDetections.length > 0 && ` | Detections: ${currentDetections.length}`}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

export default LiveMonitoringPage
