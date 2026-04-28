// ============================================================
// SafeSite AI — App Router  (Phase 9 — Groq LLM + Reports)
// File: frontend/src/App.jsx
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster }        from 'react-hot-toast'
import { AuthProvider }   from './context/AuthContext'
// import { AlertProvider }  from './context/AlertContext'  // Missing: AlertContext.jsx not implemented yet
// import { SoundProvider }  from './context/SoundContext'   // Missing: SoundContext.jsx not implemented yet
// import { SocketProvider } from './context/SocketContext'  // Missing: SocketContext.jsx not implemented yet
import ProtectedRoute     from './components/layout/ProtectedRoute'
import AppLayout          from './components/layout/AppLayout'

// Pages
import LoginPage          from './components/pages/LoginPage'
import DashboardPage      from './components/pages/DashboardPage'
import VideoUploadPage    from './components/pages/VideoUploadPage'    // Missing: VideoUploadPage.jsx not implemented yet
import LiveMonitoringPage from './components/pages/LiveMonitoringPage' // Missing: LiveMonitoringPage.jsx not implemented yet
// import AlertsPage         from './components/pages/AlertsPage'         // Missing: AlertsPage.jsx not implemented yet
// import ReportsPage        from './components/pages/ReportsPage'        // Missing: ReportsPage.jsx not implemented yet
// import SettingsPage       from './components/pages/SettingsPage'       // Missing: SettingsPage.jsx not implemented yet

/*
const Placeholder = ({ title, phase }) => (
  <div style={{ padding: '20px' }}>
    <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3', marginBottom: '8px' }}>{title}</h1>
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '6px 14px', marginBottom: '16px',
      background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
      borderRadius: '20px', fontSize: '12px', color: '#3b82f6',
    }}>🔜 Coming in Phase {phase}</div>
    <p style={{ color: '#8b949e', fontSize: '14px' }}>
      This page will be built in Phase {phase}.
    </p>
  </div>
)
*/

export default function App() {
  return (
    // Provider order:
    //   Auth   → knows if logged in
    //   Alert  → polls unread count (needs auth)
    //   Sound  → manages sound toggle (independent)
    //   Socket → connects WS, plays sounds on events (needs all above)
    <AuthProvider>
      {/* Missing providers - comment out until implemented
      <AlertProvider>
        <SoundProvider>
          <SocketProvider>
          */}
            <BrowserRouter>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background:   '#1f2937',
                    color:        '#e6edf3',
                    border:       '1px solid #30363d',
                    borderRadius: '10px',
                    fontSize:     '14px',
                  },
                  success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
                  error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
                }}
              />

              <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/"      element={<Navigate to="/dashboard" replace />} />

                {/* Protected */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard"       element={<DashboardPage />} />
                  {/* Missing page components - comment out until implemented */}
                  <Route path="/live-monitoring" element={<LiveMonitoringPage />} />
                  <Route path="/video-upload"    element={<VideoUploadPage />} />
                  {/*
                  <Route path="/alerts"          element={<AlertsPage />} />
                  <Route path="/settings"        element={<SettingsPage />} />
                  <Route path="/reports"         element={<ReportsPage />} />
                  */}
                  {/* Phase 11 - Analytics page not implemented yet */}
                  {/*
                  <Route path="/analytics"       element={<Placeholder title="📈 Analytics" phase="11" />} />
                  */}
                  {/* Phase 10 - Sites and Workers pages not implemented yet */}
                  {/*
                  <Route path="/sites"           element={<Placeholder title="🏗️ Sites"     phase="10" />} />
                  <Route path="/workers"         element={<Placeholder title="👷 Workers"   phase="10" />} />
                  */}
                </Route>

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </BrowserRouter>
          {/* 
          </SocketProvider>
        </SoundProvider>
      </AlertProvider>
      */}
    </AuthProvider>
  )
}