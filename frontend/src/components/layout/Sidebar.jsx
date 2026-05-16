import { NavLink } from 'react-router-dom'
import { useAlertContext } from '../../context/AlertContext'

export default function Sidebar() {
  const { unreadCount } = useAlertContext()

  const navItems = [
    { path: '/live-monitoring', icon: '📹', label: 'Live Monitoring'  },
    { path: '/video-upload',    icon: '🎬', label: 'Video Upload'     },
    { path: '/dashboard',       icon: '📊', label: 'Dashboard'       },
    { path: '/alerts',          icon: '🚨', label: 'Alerts', badge: unreadCount },
    { path: '/reports',         icon: '📄', label: 'Reports'          },
  ]

  return (
    <aside style={{
      width: '208px', height: '100vh',
      position: 'fixed', top: 0, left: 0, zIndex: 200,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Logo ── */}
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{
          width: '36px', height: '36px',
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0,
          boxShadow: '0 0 12px rgba(249,115,22,0.3)',
        }}>🦺</div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#e6edf3', lineHeight: 1.2 }}>
            SafeSite <span style={{ color: '#f97316' }}>AI</span>
          </div>
          <div style={{ fontSize: '10px', color: '#8b949e' }}>Safety Monitor</div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px',
              marginBottom: '2px', textDecoration: 'none',
              fontSize: '13px', fontWeight: '500',
              color:      isActive ? '#ffffff' : '#8b949e',
              background: isActive ? 'var(--accent-blue)' : 'transparent',
              transition: 'all 0.15s',
            })}
            onMouseEnter={e => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = '#e6edf3';
              }
            }}
            onMouseLeave={e => {
              if (!e.currentTarget.classList.contains('active')) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#8b949e';
              }
            }}
          >
            <span style={{ fontSize: '16px' }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge > 0 && (
              <span style={{
                minWidth: '18px', height: '18px',
                background: '#ef4444',
                borderRadius: '9px',
                fontSize: '10px', fontWeight: '700',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
                animation: 'badgePulse 2s ease-in-out infinite',
              }}>
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <style>{`
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%       { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
        }
      `}</style>
    </aside>
  )
}
