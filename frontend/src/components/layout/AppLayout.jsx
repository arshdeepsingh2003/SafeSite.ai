import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
//import ConnectionStatus from '../ui/ConnectionStatus'
import { useAuth } from '../../context/AuthContext'

const PAGE_TITLES = {
  '/dashboard':       'Construction Site Safety Monitoring',
  '/live-monitoring': 'Live Monitoring',
  '/video-upload':    'Video Upload & Analysis',
  '/alerts':          'Alerts',
  '/reports':         'Reports',
  '/sites':           'Sites',
  '/workers':         'Workers',
  '/settings':        'Settings',
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const location         = useLocation()
  const pageTitle        = PAGE_TITLES[location.pathname] || 'SafeSite AI'

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--bg-primary)' }}>

      {/* ── Sidebar (fixed) ── */}
      <Sidebar />

      {/* ── Main content area ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        marginLeft: '208px', overflow: 'hidden', minWidth: 0,
      }}>

        {/* ── Top header bar (sticky) ── */}
        <header style={{
          height:           '60px',
          position:         'sticky', top: 0, zIndex: 100,
          background:       'var(--bg-secondary)',
          borderBottom:     '1px solid var(--border)',
          display:          'flex',
          alignItems:       'center',
          justifyContent:   'space-between',
          padding:          '0 24px',
          flexShrink:       0,
        }}>

          {/* Page title */}
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#e6edf3' }}>
            {pageTitle}
          </div>

          {/* Right side: status, date, user */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

            {/* 🟢 Real-time connection status (Phase 6) */}
            {/* <ConnectionStatus /> */}
            <div style={{
                padding: '6px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                color: '#22c55e',
                }}>
  ● System Online
</div>


            {/* Date */}
            <span style={{ fontSize: '13px', color: '#8b949e' }}>
              {new Date().toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
              })}
            </span>

            {/* Notification bell */}
            <button style={{
              position:   'relative',
              background: 'transparent',
              border:     'none',
              cursor:     'pointer',
              color:      '#8b949e',
              fontSize:   '18px',
              padding:    '4px',
              lineHeight: 1,
            }}>
              🔔
              <span style={{
                position:       'absolute',
                top:            '0',
                right:          '0',
                width:          '16px',
                height:         '16px',
                background:     '#ef4444',
                borderRadius:   '50%',
                fontSize:       '10px',
                color:          'white',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontWeight:     '700',
              }}>3</span>
            </button>

            {/* User avatar + name + logout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width:          '32px',
                height:         '32px',
                background:     'var(--accent-blue)',
                borderRadius:   '50%',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '14px',
              }}>👤</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>
                  {user?.name || 'Admin'}
                </div>
                <div style={{ fontSize: '11px', color: '#8b949e' }}>Site Manager</div>
              </div>
              <button
                onClick={logout}
                title="Logout"
                style={{
                  marginLeft:     '8px',
                  background:     'rgba(239,68,68,0.1)',
                  border:         '1px solid rgba(239,68,68,0.3)',
                  borderRadius:   '6px',
                  padding:        '4px 10px',
                  cursor:         'pointer',
                  color:          '#ef4444',
                  fontSize:       '11px',
                  fontWeight:     '600',
                  lineHeight:     1,
                }}
              >
                🚪 Logout
              </button>
            </div>

          </div>
        </header>

        {/* ── Page content (scrollable) ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }} className="page-enter">
          <Outlet />
        </main>

      </div>
    </div>
  )
}