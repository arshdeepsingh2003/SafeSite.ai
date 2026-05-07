// ============================================================
// Shows a small green/red dot in the header to indicate
// whether the real-time Socket.IO connection is live.
// ============================================================

import { useSocket } from '../../context/SocketContext'

export default function ConnectionStatus() {
  const { isConnected } = useSocket()

  return (
    <div
      title={isConnected ? 'Real-time connected' : 'Real-time disconnected'}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '6px',
        padding:    '5px 10px',
        background: isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border:     `1px solid ${isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        borderRadius: '20px',
        fontSize:   '11px',
        fontWeight: '600',
        color:      isConnected ? '#22c55e' : '#ef4444',
        cursor:     'default',
      }}
    >
      <span style={{
        width:        '6px',
        height:       '6px',
        borderRadius: '50%',
        background:   isConnected ? '#22c55e' : '#ef4444',
        flexShrink:   0,
        animation:    isConnected ? 'livePulse 2s ease-in-out infinite' : 'none',
      }} />
      {isConnected ? 'Live' : 'Offline'}

      <style>{`
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          50%       { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
        }
      `}</style>
    </div>
  )
}