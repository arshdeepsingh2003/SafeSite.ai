// ============================================================
// SafeSite AI — Sidebar Navigation  (Phase 5 — live alert badge)
// File: frontend/src/components/layout/Sidebar.jsx
// ============================================================

import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth }         from '../../context/AuthContext'
// import { useAlertContext } from '../../context/AlertContext'  // Missing: AlertContext.jsx not implemented yet
import toast from 'react-hot-toast'

export default function Sidebar() {
  const { user, logout }   = useAuth()
  // const { unreadCount }    = useAlertContext()  // Missing: AlertContext.jsx not implemented yet
  const unreadCount = 0  // Placeholder value since AlertContext is not available
  const navigate           = useNavigate()

  const navItems = [
    { path: '/dashboard',       icon: '📊', label: 'Dashboard'       },
    // Pages not implemented yet - uncomment when available
    // { path: '/live-monitoring', icon: '📹', label: 'Live Monitoring'  },  // Missing: LiveMonitoringPage.jsx
    // { path: '/video-upload',    icon: '🎬', label: 'Video Upload'     },  // Missing: VideoUploadPage.jsx
    // { path: '/alerts',          icon: '🚨', label: 'Alerts', badge: unreadCount },  // Missing: AlertsPage.jsx
    // { path: '/analytics',       icon: '📈', label: 'Analytics'        },  // Missing: Analytics page
    // { path: '/reports',         icon: '📄', label: 'Reports'          },  // Missing: ReportsPage.jsx
    // { path: '/sites',           icon: '🏗️',  label: 'Sites'           },  // Missing: Sites page
    // { path: '/workers',         icon: '👷', label: 'Workers'          },  // Missing: Workers page
    // { path: '/settings',        icon: '⚙️',  label: 'Settings'        },  // Missing: SettingsPage.jsx
  ]

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return (
    <aside style={{
      width: '208px', minHeight: '100vh',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
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
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                {/* Nav item background hover handled by CSS-in-JS approach below */}
                <HoverNavItem isActive={isActive}>
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {/* Live badge — only shown when there are unread alerts */}
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
                </HoverNavItem>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Site selector ── */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Site Selector
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '7px 10px',
          background: 'var(--bg-primary)',
          borderRadius: '6px', cursor: 'pointer',
          border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: '12px' }}>📍</span>
          <span style={{ fontSize: '12px', color: '#e6edf3', flex: 1 }}>Main Construction Site</span>
          <span style={{ fontSize: '10px', color: '#8b949e' }}>▼</span>
        </div>
      </div>

      {/* ── System status ── */}
      <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '10px', color: '#8b949e', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          System Status
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px',
            background: 'rgba(34,197,94,0.15)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
          }}>🛡️</div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>Online</div>
            <div style={{ fontSize: '10px', color: '#8b949e' }}>All systems operational</div>
          </div>
        </div>
      </div>

      {/* ── User profile + logout ── */}
      <div style={{ padding: '12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px',
          background: 'var(--bg-primary)', borderRadius: '8px',
          marginBottom: '8px',
        }}>
          <div style={{
            width: '30px', height: '30px',
            background: 'var(--accent-blue)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', flexShrink: 0,
          }}>👤</div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontSize: '12px', fontWeight: '600', color: '#e6edf3',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {user?.name || 'User'}
            </div>
            <div style={{ fontSize: '10px', color: '#8b949e' }}>
              {user?.role === 'admin' ? '🔑 Admin' : '👁 Viewer'}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '7px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px', color: '#8b949e',
            fontSize: '12px', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.target.style.borderColor = '#ef4444'; e.target.style.color = '#ef4444' }}
          onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = '#8b949e' }}
        >
          🚪 Sign Out
        </button>
      </div>

      <style>{`
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%       { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
        }
      `}</style>
    </aside>
  )
}

// Inline hover helper — applies hover bg without full CSS class system
function HoverNavItem({ isActive, children }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.closest('a').style.background = 'var(--bg-hover)'
          e.currentTarget.closest('a').style.color = '#e6edf3'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.closest('a').style.background = 'transparent'
          e.currentTarget.closest('a').style.color = '#8b949e'
        }
      }}
    >
      {children}
    </div>
  )
}