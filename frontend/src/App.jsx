// ============================================================
// SafeSite AI — App Router  (Phase 12 — Reports)
// File: frontend/src/App.jsx
// ============================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster }        from 'react-hot-toast'
import { AuthProvider }   from './context/AuthContext'
import { AlertProvider }  from './context/AlertContext'
import { SocketProvider } from './context/SocketContext'
// import { SoundProvider }  from './context/SoundContext'  // FILE NOT FOUND
import ProtectedRoute     from './components/layout/ProtectedRoute'
import AppLayout          from './components/layout/AppLayout'

// ── Pages ────────────────────────────────────────────────────
import LoginPage          from './components/pages/LoginPage'
import DashboardPage      from './components/pages/DashboardPage'      // Phase 10 ✅
import LiveMonitoringPage from './components/pages/LiveMonitoringPage'
import VideoUploadPage    from './components/pages/VideoUploadPage'
import AlertsPage         from './components/pages/AlertsPage'
// import ReportsPage        from './components/pages/ReportsPage'         // Phase 9 ✅  // FILE NOT FOUND
// import SitesPage          from './components/pages/SitesPage'           // Phase 10 ✅ // FILE NOT FOUND
// import WorkersPage        from './components/pages/WorkersPage'         // Phase 10 ✅ // FILE NOT FOUND
// import SettingsPage       from './components/pages/SettingsPage'       // FILE NOT FOUND
// import AnalyticsPage      from './components/pages/AnalyticsPage'      // Phase 11 ✅ // FILE NOT FOUND

export default function App() {
  return (
    <AuthProvider>
      <AlertProvider>
        <SocketProvider>
          {/* <SoundProvider> */}  {/* FILE NOT FOUND */}
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
                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route path="/dashboard"       element={<DashboardPage />} />      {/* ✅ Phase 10 */}
                  <Route path="/live-monitoring" element={<LiveMonitoringPage />} />
                  <Route path="/video-upload"    element={<VideoUploadPage />} />
                  <Route path="/alerts"          element={<AlertsPage />} />
                  {/* <Route path="/reports"         element={<ReportsPage />} />         // FILE NOT FOUND */}
                  {/* <Route path="/sites"           element={<SitesPage />} />           // FILE NOT FOUND */}
                  {/* <Route path="/workers"         element={<WorkersPage />} />         // FILE NOT FOUND */}
                  {/* <Route path="/settings"        element={<SettingsPage />} />        // FILE NOT FOUND */}
                  {/* <Route path="/analytics"       element={<AnalyticsPage />} />           // FILE NOT FOUND */}
                </Route>

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </BrowserRouter>
          {/* </SoundProvider> */}  {/* FILE NOT FOUND */}
        </SocketProvider>
      </AlertProvider>
    </AuthProvider>
  )
}