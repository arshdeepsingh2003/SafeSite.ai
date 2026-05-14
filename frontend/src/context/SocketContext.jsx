
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import socket from '../services/socket'
import { useAuth }         from './AuthContext'
import { useAlertContext } from './AlertContext'
import { useSoundSettings } from './SoundContext'
import { playAlarm, playBeep, playSuccess } from '../services/soundService'

const SocketContext = createContext(null)

// ── Violation display helpers ─────────────────────────────────
const VIOLATION_META = {
  no_helmet:             { icon: '⛑️',  label: 'No Helmet',          color: '#f97316' },
  no_vest:               { icon: '🦺', label: 'No Vest',             color: '#eab308' },
  no_helmet_and_no_vest: { icon: '🚨', label: 'No Helmet & No Vest', color: '#ef4444' },
}

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastAlert,   setLastAlert]   = useState(null)
  const { isLoggedIn }                = useAuth()
  const { refreshCount }              = useAlertContext()
  const { soundEnabled, highOnly }    = useSoundSettings()

  // ── Toast cooldown tracker ────────────────────────────────
  // Key: "worker_id:zone:violation_type" → timestamp of last toast
  // Prevents showing the same toast twice within 5 seconds.
  const toastCooldowns = useRef({})

  function isToastCoolingDown(data) {
    const key    = `${data.worker_id}:${data.zone}:${data.violation_type}`
    const lastTs = toastCooldowns.current[key]
    const now    = Date.now()
    if (lastTs && now - lastTs < 5000) return true   // 5-second cooldown
    toastCooldowns.current[key] = now
    return false
  }

  // ── Handle incoming new_alert ─────────────────────────────
  const handleNewAlert = useCallback((data) => {
    console.log('🚨 new_alert received:', data)

    setLastAlert(data)
    refreshCount()

    // ── Sound logic ───────────────────────────────────────
    if (soundEnabled) {
      const isHigh = data.severity === 'high'
      if (isHigh) {
        playAlarm()                        // 3-tone descending klaxon
      } else if (!highOnly) {
        playBeep()                         // Single soft beep
      }
    }

    // ── Toast cooldown check ──────────────────────────────
    if (isToastCoolingDown(data)) return

    // ── Custom toast notification ─────────────────────────
    const meta   = VIOLATION_META[data.violation_type] || { icon: '⚠️', label: data.violation_type, color: '#8b949e' }
    const isHigh = data.severity === 'high'

    toast.custom(
      (t) => (
        <div
          onClick={() => toast.dismiss(t.id)}
          style={{
            display:      'flex',
            alignItems:   'flex-start',
            gap:          '12px',
            padding:      '14px 16px',
            background:   '#1f2937',
            border:       `1px solid ${isHigh ? '#ef444450' : '#f9731650'}`,
            borderLeft:   `4px solid ${isHigh ? '#ef4444' : '#f97316'}`,
            borderRadius: '10px',
            cursor:       'pointer',
            maxWidth:     '340px',
            boxShadow:    isHigh
              ? '0 8px 24px rgba(239,68,68,0.25)'
              : '0 8px 24px rgba(0,0,0,0.4)',
            animation:    t.visible ? 'slideIn 0.3s ease' : 'slideOut 0.2s ease',
          }}
        >
          {/* Icon box */}
          <div style={{
            width:          '38px',
            height:         '38px',
            flexShrink:     0,
            background:     `${meta.color}20`,
            border:         `1px solid ${meta.color}40`,
            borderRadius:   '8px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '18px',
          }}>
            {meta.icon}
          </div>

          {/* Text content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: meta.color }}>
                {meta.label}
              </span>
              <span style={{
                fontSize:     '10px',
                fontWeight:   '700',
                padding:      '1px 6px',
                borderRadius: '8px',
                background:   isHigh ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)',
                color:        isHigh ? '#ef4444' : '#eab308',
                textTransform: 'uppercase',
              }}>
                {data.severity}
              </span>
            </div>

            {/* Location */}
            <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: 1.5 }}>
              {data.camera} &bull; {data.zone}
            </div>

            {/* Worker ID */}
            {data.worker_id && (
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                Worker #{data.worker_id}
              </div>
            )}

            {/* Source badge */}
            <div style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '4px',
              marginTop:    '6px',
              fontSize:     '10px',
              color:        '#6b7280',
            }}>
              {data.source === 'live_stream' ? '📡 Live Stream' : '🎬 Video Analysis'}
            </div>
          </div>

          {/* Pulsing severity dot */}
          <div style={{
            width:        '8px',
            height:       '8px',
            borderRadius: '50%',
            background:   isHigh ? '#ef4444' : '#f97316',
            flexShrink:   0,
            marginTop:    '4px',
            animation:    'pulse 1.5s infinite',
          }} />
        </div>
      ),
      {
        duration: isHigh ? 8000 : 5000,
        position: 'top-right',
      }
    )
  }, [refreshCount, soundEnabled, highOnly])

  // ── Handle alert_resolved ─────────────────────────────────
  const handleAlertResolved = useCallback((data) => {
    console.log('✅ alert_resolved received:', data)
    refreshCount()
    if (soundEnabled) playSuccess()
  }, [refreshCount, soundEnabled])

  // ── Handle analysis_complete ─────────────────────────────
  const handleAnalysisComplete = useCallback((data) => {
    console.log('📊 analysis_complete received:', data)
    const rate = data.compliance_rate ?? '?'
    toast.success(`Analysis complete! Compliance rate: ${rate}%`)
  }, [])

  // ── Connect / disconnect with login state ─────────────────
  useEffect(() => {
    if (isLoggedIn) {
      socket.connect()
      socket.on('connect',            () => setIsConnected(true))
      socket.on('disconnect',         () => setIsConnected(false))
      socket.on('new_alert',          handleNewAlert)
      socket.on('alert_resolved',     handleAlertResolved)
      socket.on('analysis_complete',  handleAnalysisComplete)
      socket.on('connect', () => socket.emit('join_room', { room: 'all' }))
    } else {
      socket.disconnect()
      setIsConnected(false)
    }

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('new_alert',          handleNewAlert)
      socket.off('alert_resolved',     handleAlertResolved)
      socket.off('analysis_complete',  handleAnalysisComplete)
    }
  }, [isLoggedIn, handleNewAlert, handleAlertResolved, handleAnalysisComplete])

  return (
    <SocketContext.Provider value={{ isConnected, socket, lastAlert }}>
      {children}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(110%); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1;   }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>')
  return ctx
}